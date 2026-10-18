import { AppError } from '@/types/errors'
import { detectCapabilities } from './capabilities'
import { MAY_HAVE_ALPHA, decodeImage } from './decode'
import { encodePngIndexed, encodePngTruecolor, quantize, reconstruct, type Rgba } from './png'
import { drawToCanvas, encodeCanvas, type OutputMime } from './process'
import { outputName } from './sizing'
import { bitmapHasAlpha, decodeToRgba, looksLikeSource, pixelsMatch, validateImageBlob } from './validate-output'
import { formatByKind } from '@/services/formats/registry'

export type ImageMode = 'compress' | 'resize' | 'convert'

export interface ImageJob {
  file: File
  mode: ImageMode
  output: OutputMime | 'same'
  /** 0.1–1. JPEG/WebP encoder quality; for PNG it selects lossless vs reduced colours. */
  quality: number
  maxWidth?: number
  maxHeight?: number
  allowEnlarge: boolean
  suffix: string
  allowFirstFrame: boolean
}

export interface ImageJobResult {
  keptOriginal: boolean
  /** Absent when the original was kept. */
  blob?: Blob
  name: string
  width: number
  height: number
  mime: OutputMime | null
  /** What was actually done, e.g. "JPEG quality 60%". */
  method: string
  notes: string[]
}

const MIME_OF: Partial<Record<string, OutputMime>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const LOSSLESS_SOURCES = new Set(['png', 'gif', 'bmp', 'tiff', 'ico'])
/** The palette/validation path holds several RGBA-sized buffers; above this the standard encoder is used instead. */
export const PNG_ADVANCED_MAX_PIXELS = 16_000_000

/** Quality → PNG strategy. ≥90% is lossless; below that the palette is reduced (lossy). */
export function pngColorsFor(quality: number): number {
  return quality >= 0.9 ? 0 : quality >= 0.7 ? 256 : quality >= 0.5 ? 128 : 64
}

/** At most three tries, stopping at the first result smaller than the original (compress mode, same format). */
export function qualityLadder(base: number, tryLower: boolean): number[] {
  const q = Math.min(1, Math.max(0.1, Math.round(base * 100) / 100))
  if (!tryLower) return [q]
  return [q, Math.round((q - 0.1) * 100) / 100, Math.round((q - 0.2) * 100) / 100].filter((v, i) => i === 0 || v >= 0.3)
}

const pct = (q: number) => `${Math.round(q * 100)}%`
const fmtLabel = (m: OutputMime) => m === 'image/jpeg' ? 'JPEG' : m === 'image/png' ? 'PNG' : 'WebP'

export async function runImageJob(job: ImageJob): Promise<ImageJobResult> {
  const { file } = job
  const dec = await decodeImage(file, { allowFirstFrame: job.allowFirstFrame })
  const bitmap = dec.bitmap
  try {
    const caps = await detectCapabilities()
    const srcMime = MIME_OF[dec.kind] ?? null
    const srcLabel = formatByKind(dec.kind)?.label ?? dec.kind.toUpperCase()
    const notes = [...dec.notes]

    let target: OutputMime
    if (job.output === 'same') {
      if (srcMime) target = srcMime
      else { target = 'image/png'; notes.push(`${srcLabel} cannot be written back as ${srcLabel} here, so the result is a PNG.`) }
    } else target = job.output
    if (!caps.encode[target]) throw new AppError('PROCESSING_FAILED', `Your browser cannot create ${fmtLabel(target)} images. Choose another output format.`)

    const hasAlpha = MAY_HAVE_ALPHA.has(dec.kind) && bitmapHasAlpha(bitmap)
    const sameFormat = srcMime === target
    if (target === 'image/jpeg' && hasAlpha) notes.push('JPG has no transparency: transparent areas were filled with white.')
    if (target !== 'image/png' && LOSSLESS_SOURCES.has(dec.kind) && !sameFormat) notes.push(`Converted from lossless ${srcLabel} to lossy ${fmtLabel(target)}: some fine detail is lost.`)
    else if (target !== 'image/png' && srcMime && !sameFormat) notes.push(`Re-encoded ${srcLabel} as ${fmtLabel(target)}: lossy to lossy adds a small further quality loss.`)

    const { canvas, ctx, width, height } = drawToCanvas(bitmap, { maxWidth: job.maxWidth, maxHeight: job.maxHeight, allowEnlarge: job.allowEnlarge, mime: target })
    const resized = width !== bitmap.width || height !== bitmap.height
    const compare = job.mode === 'compress' && sameFormat && !resized // "smaller than the original" is meaningful

    let best: { blob: Blob; method: string } | null = null
    if (target === 'image/png') {
      best = await encodePng({ ctx, width, height }, job.mode === 'compress' ? pngColorsFor(job.quality) : 0, compare ? file.size : null, notes)
    } else {
      const ladder = qualityLadder(job.quality, compare)
      for (const [i, q] of ladder.entries()) {
        const blob = await encodeCanvas(canvas, target, q)
        if (blob.type !== target) throw new AppError('PROCESSING_FAILED', `This browser cannot export ${fmtLabel(target)}.`)
        if (!best || blob.size < best.blob.size) best = { blob, method: `${fmtLabel(target)} quality ${pct(q)}${i > 0 ? ` (lowered from ${pct(ladder[0]!)} to get below the original size)` : ''}` }
        if (!compare || blob.size < file.size) break
      }
    }
    if (!best) throw new AppError('PROCESSING_FAILED', 'No output could be produced.')

    if (compare && best.blob.size >= file.size) {
      return { keptOriginal: true, name: file.name, width, height, mime: srcMime, method: 'Original kept', notes }
    }
    await validateImageBlob(best.blob, { mime: target, width, height, expectAlpha: hasAlpha && target !== 'image/jpeg' })
    return {
      keptOriginal: false, blob: new Blob([best.blob], { type: target }), name: outputName(file.name, job.suffix, target),
      width, height, mime: target, method: best.method, notes,
    }
  } finally {
    bitmap.close()
  }
}

async function encodePng(
  src: { ctx: { getImageData(x: number, y: number, w: number, h: number): ImageData }; width: number; height: number },
  colors: number,
  originalSize: number | null,
  notes: string[],
): Promise<{ blob: Blob; method: string }> {
  const { width, height } = src
  if (width * height > PNG_ADVANCED_MAX_PIXELS) {
    const { canvas } = { canvas: (src.ctx as unknown as { canvas: OffscreenCanvas | HTMLCanvasElement }).canvas }
    notes.push('Very large image: the standard PNG encoder was used (no colour reduction).')
    return { blob: await encodeCanvas(canvas, 'image/png', 1), method: 'PNG (standard encoder)' }
  }
  const img = src.ctx.getImageData(0, 0, width, height)
  const rgba: Rgba = { data: img.data, width, height }

  const attempts = colors > 0 ? [colors, 0] : [0]
  let best: { blob: Blob; method: string; note?: string } | null = null
  for (const n of attempts) {
    let bytes: Uint8Array, expected: ArrayLike<number>, method: string, note: string | undefined
    if (n === 0) {
      bytes = encodePngTruecolor(rgba); expected = img.data; method = 'PNG, lossless'
    } else {
      const q = quantize(rgba, n)
      expected = reconstruct(q, width, height)
      // Never offer a colour-reduced image that no longer looks like the original; lossless (or the original) instead.
      if (!q.exact && !looksLikeSource(img.data, expected)) {
        notes.push(`Reducing this image to ${n} colours would visibly change it, so colour reduction was skipped and only lossless compression was tried.`)
        continue
      }
      bytes = encodePngIndexed(q, width, height)
      const k = q.palette.length / 4, colours = `${k} colour${k === 1 ? '' : 's'}`
      method = q.exact ? `PNG, lossless (${colours})` : `PNG reduced to ${colours} (lossy)`
      if (!q.exact) note = `PNG colours were reduced to at most ${n} (no dithering). Gradients may show banding. Choose High Quality for lossless.`
    }
    const blob = new Blob([bytes as BlobPart], { type: 'image/png' })
    // Prove the encoder: decode our own output and compare every pixel with what we meant to write.
    if (!pixelsMatch(expected, await decodeToRgba(blob))) throw new AppError('PROCESSING_FAILED', 'The PNG result did not match the source pixels and was discarded.')
    if (!best || blob.size < best.blob.size) best = { blob, method, note }
    if (originalSize === null || blob.size < originalSize) break
  }
  // The last attempt is always lossless and never skipped, so there is a result.
  if (best!.note) notes.push(best!.note)
  return best!
}
