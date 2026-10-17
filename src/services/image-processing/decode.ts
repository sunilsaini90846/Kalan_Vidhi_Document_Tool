import { detectKind, readHead, type DetectedKind } from '@/services/file-validation/signatures'
import { explainUnsupported, formatByKind } from '@/services/formats/registry'
import { AppError } from '@/types/errors'
import { LIMITS } from '@/utils/limits'
import { detectAnimation } from './animation'
import { readDimensions } from './dimensions'
import { loadBitmap } from './process'

/** Raster kinds this pipeline can decode (SVG is rasterized to PNG on the main thread before it gets here). */
export const DECODABLE: readonly DetectedKind[] = ['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'ico']
/** Kinds whose decoding depends on the browser, so a failure may mean "unsupported here". */
const BROWSER_DEPENDENT = new Set<DetectedKind>(['avif', 'bmp', 'ico', 'webp'])
/** Kinds that can carry transparency. */
export const MAY_HAVE_ALPHA = new Set<DetectedKind>(['png', 'webp', 'gif', 'avif', 'ico', 'tiff'])

export interface DecodeOptions {
  /** Animated inputs are refused unless the user opted in to using only the first frame. */
  allowFirstFrame?: boolean
  honorExif?: boolean
}
export interface Decoded {
  bitmap: ImageBitmap
  kind: DetectedKind
  animated: boolean
  frames?: number
  notes: string[]
}

const PREFIX = 1024 * 1024

async function readBytes(file: Blob, length: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer())
}

export function assertPixelBudget(width: number, height: number, name: string): void {
  if (width * height > LIMITS.maxPixels) {
    const mp = (n: number) => `${(n / 1e6).toFixed(1)} megapixels`
    throw new AppError('FILE_TOO_LARGE', `"${name}" is ${width}×${height} (${mp(width * height)}); the limit is ${mp(LIMITS.maxPixels)} to protect your browser's memory. Resize it with another tool first.`)
  }
}

export const name = (f: Blob) => (f instanceof File ? f.name : 'This image')

/**
 * Identifies the real format by content, refuses what we cannot handle (with a reason), checks size/animation
 * budgets from the header, and only then decodes. Never decides anything from the file name or MIME type.
 */
export async function decodeImage(file: Blob, opts: DecodeOptions = {}): Promise<Decoded> {
  const fname = name(file)
  const head = await readHead(file)
  const kind = detectKind(head)
  if (!DECODABLE.includes(kind)) {
    throw new AppError('UNSUPPORTED_TYPE', explainUnsupported(kind, fname) ?? `"${fname}" is not a supported image.`)
  }
  const notes: string[] = []
  const prefix = await readBytes(file, kind === 'gif' ? Math.min(file.size, LIMITS.maxFileBytes) : PREFIX)

  const anim = detectAnimation(kind, prefix)
  if (anim.animated) {
    const label = formatByKind(kind)?.label ?? kind.toUpperCase()
    const what = kind === 'png' ? 'APNG (animated PNG)' : `animated ${label}`
    if (!opts.allowFirstFrame) {
      throw new AppError('PROCESSING_FAILED', `"${fname}" is an ${what}${anim.frames ? ` with ${anim.frames}+ frames` : ''}. Processing it here would keep only the first frame and lose the animation. Tick “Use only the first frame of animated images” if that is what you want.`)
    }
    notes.push(`Animated ${label}: only the first frame was used; the animation is not preserved.`)
  }

  const dims = readDimensions(kind, prefix)
  if (dims) assertPixelBudget(dims.width, dims.height, fname)

  let bitmap: ImageBitmap
  if (kind === 'tiff') {
    const t = await decodeTiff(file, fname)
    bitmap = t.bitmap
    if (t.pages > 1) notes.push(`This TIFF has ${t.pages} pages; only the first page was used.`)
  } else {
    try { bitmap = await loadBitmap(file, opts.honorExif ?? true) } catch (e) {
      const label = formatByKind(kind)?.label ?? kind.toUpperCase()
      const hint = BROWSER_DEPENDENT.has(kind) ? ` Your browser may not support ${label}, or the file is damaged.` : ' The file may be damaged or truncated.'
      throw new AppError('PROCESSING_FAILED', e instanceof AppError ? `"${fname}" could not be decoded.${hint}` : `"${fname}" could not be decoded.${hint}`)
    }
  }
  try { assertPixelBudget(bitmap.width, bitmap.height, fname) } catch (e) { bitmap.close(); throw e }
  return { bitmap, kind, animated: anim.animated, frames: anim.frames, notes }
}

/** TIFF is not decodable by browsers; utif2 (MIT) is loaded only when a TIFF is actually opened. */
async function decodeTiff(file: Blob, fname: string): Promise<{ bitmap: ImageBitmap; pages: number }> {
  const buf = await file.arrayBuffer()
  const UTIF = await import('utif2')
  try {
    const ifds = UTIF.decode(buf)
    const first = ifds[0]
    const tags = (first ?? {}) as unknown as Record<string, number[] | undefined>
    const w = Number(tags.t256?.[0]), h = Number(tags.t257?.[0])
    if (!first || !w || !h) throw new Error('no image')
    assertPixelBudget(w, h, fname)
    UTIF.decodeImage(buf, first)
    const rgba = UTIF.toRGBA8(first)
    const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), first.width, first.height))
    return { bitmap, pages: ifds.length }
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('PROCESSING_FAILED', `"${fname}" could not be decoded as a TIFF. The file may be damaged, or it uses a TIFF variant (for example 16-bit float or unusual compression) that is not supported.`)
  }
}
