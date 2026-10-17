import { detectKind, type DetectedKind } from '@/services/file-validation/signatures'
import { AppError } from '@/types/errors'
import { context2d, makeCanvas, type OutputMime } from './process'

const KIND: Record<OutputMime, DetectedKind> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const bad = (m: string) => new AppError('PROCESSING_FAILED', `The result failed validation (${m}) and was discarded.`)

/** True when any pixel is not fully opaque. Samples a ≤512px thumbnail, where partially transparent edges survive averaging. */
export function bitmapHasAlpha(bmp: ImageBitmap): boolean {
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
  const ctx = context2d(makeCanvas(w, h))
  ctx.drawImage(bmp, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) return true
  return false
}

export interface OutputExpectation { mime: OutputMime; width: number; height: number; expectAlpha: boolean }

/**
 * An encoder returning without error proves nothing, so check the file itself:
 * non-empty, real format by signature, decodes, correct dimensions (which also proves orientation was applied),
 * and transparency still present when it should be.
 */
export async function validateImageBlob(blob: Blob, exp: OutputExpectation): Promise<void> {
  if (blob.size === 0) throw bad('empty file')
  const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer())
  if (detectKind(head) !== KIND[exp.mime]) throw bad(`not a real ${KIND[exp.mime].toUpperCase()} file`)
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'none' }) } catch { throw bad('it cannot be decoded') }
  try {
    if (bmp.width !== exp.width || bmp.height !== exp.height) throw bad(`size ${bmp.width}×${bmp.height}, expected ${exp.width}×${exp.height}`)
    if (exp.expectAlpha && !bitmapHasAlpha(bmp)) throw bad('transparency was lost')
  } finally { bmp.close() }
}

/**
 * Opaque pixels must match exactly. Canvas stores colour premultiplied by alpha, so translucent pixels lose precision
 * on a round trip; those are compared in premultiplied space (alpha ±1, premultiplied colour ±2).
 */
export function pixelsMatch(expected: ArrayLike<number>, actual: ArrayLike<number>): boolean {
  if (expected.length !== actual.length) return false
  for (let i = 0; i < expected.length; i += 4) {
    const ea = expected[i + 3]!, aa = actual[i + 3]!
    if (ea === 255 || aa === 255) { if (ea !== aa || expected[i] !== actual[i] || expected[i + 1] !== actual[i + 1] || expected[i + 2] !== actual[i + 2]) return false; continue }
    if (Math.abs(ea - aa) > 1) return false
    for (let c = 0; c < 3; c++) if (Math.abs((expected[i + c]! * ea) / 255 - (actual[i + c]! * aa) / 255) > 2) return false
  }
  return true
}

/** Decodes a PNG blob back to RGBA, so the encoder's output can be compared with what it was given. */
export async function decodeToRgba(blob: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  try {
    const ctx = context2d(makeCanvas(bmp.width, bmp.height))
    ctx.drawImage(bmp, 0, 0)
    return ctx.getImageData(0, 0, bmp.width, bmp.height).data
  } finally { bmp.close() }
}
