import { AppError } from '@/types/errors'
import { targetSize, type Box } from './sizing'

export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface RenderOptions extends Box {
  mime: OutputMime
  quality: number // 0..1; ignored for PNG
  allowEnlarge?: boolean
  rotate?: 0 | 90 | 180 | 270
  /** Centre-crop to this width/height ratio before resizing. */
  cropAspect?: number
  /** Paint a white background (needed for JPEG and for flattening transparency). */
  flatten?: boolean
}

export interface RenderedImage { blob: Blob; width: number; height: number }

/** `honorExif=false` keeps pixels as stored, for formats whose viewers ignore EXIF orientation. */
export function loadBitmap(blob: Blob, honorExif = true): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: honorExif ? 'from-image' : 'none' }).catch(() => {
    throw new AppError('PROCESSING_FAILED', 'This image could not be decoded by your browser. The file may be damaged or truncated.')
  })
}

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** OffscreenCanvas works on the main thread and in workers; fall back to a DOM canvas on old browsers. */
export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

export function encodeCanvas(canvas: AnyCanvas, mime: OutputMime, quality: number): Promise<Blob> {
  const fail = () => new AppError('PROCESSING_FAILED', 'Your browser could not encode this format.')
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: mime, quality }).catch(() => { throw fail() })
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(fail())), mime, quality))
}

export function context2d(canvas: AnyCanvas): Ctx {
  const ctx = canvas.getContext('2d') as Ctx | null
  if (!ctx) throw new AppError('PROCESSING_FAILED', 'Canvas is not available in this browser, or the image is too large for it.')
  return ctx
}

/** Draws (crop → rotate → resize) onto a fresh canvas. Never enlarges unless `allowEnlarge`. */
export function drawToCanvas(source: ImageBitmap, o: Pick<RenderOptions, 'maxWidth' | 'maxHeight' | 'allowEnlarge' | 'rotate' | 'cropAspect' | 'flatten'> & { mime?: OutputMime }) {
  let sw = source.width, sh = source.height, sx = 0, sy = 0
  if (o.cropAspect) {
    const current = sw / sh
    if (current > o.cropAspect) { const nw = Math.round(sh * o.cropAspect); sx = Math.round((sw - nw) / 2); sw = nw }
    else { const nh = Math.round(sw / o.cropAspect); sy = Math.round((sh - nh) / 2); sh = nh }
  }
  const rot = o.rotate ?? 0
  const swap = rot === 90 || rot === 270
  const { width, height } = targetSize(swap ? sh : sw, swap ? sw : sh, o, o.allowEnlarge)

  const canvas = makeCanvas(width, height)
  const ctx = context2d(canvas)
  if (o.flatten || o.mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height) }
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(width / 2, height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  const dw = swap ? height : width, dh = swap ? width : height
  ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
  return { canvas, ctx, width, height }
}

/** Decode → transform on canvas → encode, then verify the output actually decodes at the right size. */
export async function renderImage(source: ImageBitmap, o: RenderOptions): Promise<RenderedImage> {
  const { canvas, width, height } = drawToCanvas(source, o)
  const blob = await encodeCanvas(canvas, o.mime, o.quality)
  if (blob.type !== o.mime) throw new AppError('PROCESSING_FAILED', `This browser cannot export ${o.mime.replace('image/', '').toUpperCase()}.`)
  const check = await loadBitmap(blob)
  const ok = check.width === width && check.height === height && blob.size > 0
  check.close()
  if (!ok) throw new AppError('PROCESSING_FAILED', 'The generated image failed validation.')
  return { blob, width, height }
}
