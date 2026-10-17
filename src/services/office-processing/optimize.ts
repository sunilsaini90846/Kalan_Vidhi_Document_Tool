import { ARCHIVE_LIMITS } from '@/services/archive-processing/limits'
import { createZip } from '@/services/archive-processing/zipCreate'
import { readZip } from '@/services/archive-processing/zipRead'
import { PRESETS, type CompressPreset } from '@/services/image-processing/presets'
import { loadBitmap, renderImage } from '@/services/image-processing/process'
import { AppError } from '@/types/errors'
import type { OfficeFormat } from './formats'
import { describeMedia, isMediaPart, readOfficePackage } from './inspect'

export interface OfficeReport {
  bytes: Uint8Array
  originalSize: number
  imagesFound: number
  imagesOptimized: number
  imagesSkipped: number
  noGain: boolean
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Output must contain exactly the same parts, and every part except re-encoded images must be
 * byte-identical (so relationships, content types, formulas and text cannot have changed).
 */
export function verifyPackage(original: { name: string; data: Uint8Array }[], output: Uint8Array, changed: Set<string>): void {
  const out = readZip(output, ARCHIVE_LIMITS)
  const bad = () => new AppError('PROCESSING_FAILED', 'The optimized file failed validation and was discarded.')
  if (out.length !== original.length) throw bad()
  out.forEach((o, i) => {
    const src = original[i]!
    if (o.name !== src.name) throw bad()
    if (!changed.has(o.name) && !equal(o.data, src.data)) throw bad()
  })
}

export async function optimizeOffice(
  input: Uint8Array,
  format: OfficeFormat,
  fileName: string,
  preset: CompressPreset,
  onProgress?: (done: number, total: number) => void,
  signal?: { cancelled: boolean },
): Promise<OfficeReport> {
  const files = readOfficePackage(input, format, fileName)
  const { quality, maxDimension } = PRESETS[preset]
  const media = files.filter((f) => isMediaPart(f.name, format))
  const targets = media.filter((f) => {
    const info = describeMedia(f.name, f.data)
    return info.optimizable && (info.kind === 'jpeg' || maxDimension !== undefined)
  })

  const replaced = new Map<string, Uint8Array>()
  for (const [i, f] of targets.entries()) {
    if (signal?.cancelled) throw new AppError('CANCELLED', 'Cancelled.')
    onProgress?.(i, targets.length)
    const jpeg = describeMedia(f.name, f.data).kind === 'jpeg'
    try {
      // Word/PowerPoint/Excel ignore EXIF orientation, so keep pixels exactly as stored.
      const bmp = await loadBitmap(new Blob([f.data as BlobPart], { type: jpeg ? 'image/jpeg' : 'image/png' }), false)
      let out
      try {
        out = await renderImage(bmp, { mime: jpeg ? 'image/jpeg' : 'image/png', quality, maxWidth: maxDimension, maxHeight: maxDimension, flatten: jpeg })
      } finally { bmp.close() }
      const resized = out.width !== bmp.width
      if (!jpeg && !resized) continue // lossless PNG re-encode alone is not worth the risk
      if (out.blob.size >= f.data.length * 0.95) continue
      replaced.set(f.name, new Uint8Array(await out.blob.arrayBuffer()))
    } catch { /* leave this image untouched */ }
  }
  onProgress?.(targets.length, targets.length)

  const bytes = createZip(files.map((f) => ({ name: f.name, data: replaced.get(f.name) ?? f.data })), 'auto', true)
  verifyPackage(files, bytes, new Set(replaced.keys()))
  return {
    bytes, originalSize: input.length,
    imagesFound: media.length, imagesOptimized: replaced.size, imagesSkipped: media.length - replaced.size,
    noGain: bytes.length >= input.length,
  }
}
