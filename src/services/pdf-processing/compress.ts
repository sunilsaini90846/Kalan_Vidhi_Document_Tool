import { BRAND } from '@/config/brand'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream } from 'pdf-lib'
import { PRESETS, type CompressPreset } from '@/services/image-processing/presets'
import { loadBitmap, renderImage } from '@/services/image-processing/process'
import { loadPdf, assertEditable, describePdf } from './pdfOps'
import { AppError } from '@/types/errors'

export type { CompressPreset }
export const PRESET_DETAIL: Record<CompressPreset, string> = {
  light: 'JPEG images re-encoded at 85% quality; pixel dimensions kept.',
  balanced: 'JPEG quality 70%, images over 2000 px downscaled.',
  strong: 'JPEG quality 50%, images over 1400 px downscaled. Visible quality loss.',
}

export interface CompressReport {
  bytes: Uint8Array
  originalSize: number
  imagesFound: number
  imagesRecompressed: number
  imagesSkipped: number
  pages: number
  /** True when output is not smaller; caller should keep the original. */
  noGain: boolean
}

const N = (s: string) => PDFName.of(s)

function jpegFilter(d: PDFDict): boolean {
  let f = d.lookup(N('Filter'))
  if (f instanceof PDFArray && f.size() === 1) f = f.lookup(0)
  return f === N('DCTDecode')
}

function colorOk(d: PDFDict): boolean {
  const cs = d.lookup(N('ColorSpace'))
  if (cs === N('DeviceRGB') || cs === N('DeviceGray')) return true
  if (cs instanceof PDFArray && cs.lookup(0) === N('ICCBased')) {
    const prof = cs.lookup(1)
    const n = prof instanceof PDFStream ? prof.dict.lookup(N('N')) : undefined
    return n instanceof PDFNumber && (n.asNumber() === 3 || n.asNumber() === 1)
  }
  return false // CMYK, Indexed, Separation… are left untouched
}

function eligible(d: PDFDict): boolean {
  if (d.lookup(N('Subtype')) !== N('Image') || !jpegFilter(d) || !colorOk(d)) return false
  if (d.has(N('Decode')) || d.has(N('Mask'))) return false
  const stencil = d.lookup(N('ImageMask'))
  return !(stencil instanceof PDFBool && stencil.asBoolean())
}

export async function compressPdf(
  input: Uint8Array,
  preset: CompressPreset,
  onProgress?: (done: number, total: number) => void,
  signal?: { cancelled: boolean },
): Promise<CompressReport> {
  const doc = await loadPdf(input)
  assertEditable(describePdf(doc), 'This PDF')
  const { quality, maxDimension } = PRESETS[preset]
  const ctx = doc.context
  const images = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(N('Subtype')) === N('Image'))
  const candidates = images.filter(([, o]) => eligible((o as PDFRawStream).dict))

  let recompressed = 0
  for (const [i, [, obj]] of candidates.entries()) {
    if (signal?.cancelled) throw new AppError('CANCELLED', 'Cancelled.')
    onProgress?.(i, candidates.length)
    const stream = obj as PDFRawStream
    try {
      const original = stream.contents
      // PDF viewers ignore EXIF orientation, so do not bake it in.
      const bmp = await loadBitmap(new Blob([original as BlobPart], { type: 'image/jpeg' }), false)
      let out
      try { out = await renderImage(bmp, { mime: 'image/jpeg', quality, maxWidth: maxDimension, maxHeight: maxDimension, flatten: true }) } finally { bmp.close() }
      if (out.blob.size >= original.length * 0.95) continue
      const bytes = new Uint8Array(await out.blob.arrayBuffer())
      const d = stream.dict
      d.set(N('Width'), PDFNumber.of(out.width))
      d.set(N('Height'), PDFNumber.of(out.height))
      d.set(N('ColorSpace'), N('DeviceRGB'))
      d.set(N('BitsPerComponent'), PDFNumber.of(8))
      d.set(N('Filter'), N('DCTDecode'))
      d.delete(N('DecodeParms'))
      d.set(N('Length'), PDFNumber.of(bytes.length))
      ;(stream as { contents: Uint8Array }).contents = bytes
      recompressed++
    } catch { /* leave this image untouched */ }
  }
  onProgress?.(candidates.length, candidates.length)

  doc.setProducer(BRAND.producer)
  const pages = doc.getPageCount()
  const bytes = await doc.save({ useObjectStreams: true })
  const check = await PDFDocument.load(bytes)
  if (check.getPageCount() !== pages) throw new AppError('PROCESSING_FAILED', 'The generated PDF failed validation.')
  return {
    bytes, originalSize: input.length, pages,
    imagesFound: images.length, imagesRecompressed: recompressed, imagesSkipped: images.length - recompressed,
    noGain: bytes.length >= input.length,
  }
}
