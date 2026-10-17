import { decodeImage } from '@/services/image-processing/decode'
import { renderImage } from '@/services/image-processing/process'
import { cellAspect, type PageSettings } from '@/services/pdf-processing/layout'
import type { PdfImage } from '@/services/pdf-processing/imagesToPdf'

export interface PrepareOptions {
  rotate: 0 | 90 | 180 | 270
  quality: number // 1 = lossless PNG, otherwise JPEG quality
  maxDimension?: number // px, longest side
  allowFirstFrame?: boolean
}

/**
 * Decode (format-checked, EXIF-aware, animation-checked), rotate, optionally crop to the cell (fill mode) and resize,
 * flatten transparency onto white, then encode for embedding.
 */
export async function prepareImage(file: File, page: PageSettings, o: PrepareOptions): Promise<PdfImage> {
  const { bitmap } = await decodeImage(file, { allowFirstFrame: o.allowFirstFrame })
  try {
    const lossless = o.quality >= 1
    const out = await renderImage(bitmap, {
      mime: lossless ? 'image/png' : 'image/jpeg',
      quality: o.quality,
      rotate: o.rotate,
      flatten: true,
      maxWidth: o.maxDimension,
      maxHeight: o.maxDimension,
      cropAspect: page.fit === 'fill' ? cellAspect(page) : undefined,
    })
    return { bytes: new Uint8Array(await out.blob.arrayBuffer()), kind: lossless ? 'png' : 'jpeg' }
  } finally { bitmap.close() }
}
