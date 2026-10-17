import { AppError } from '@/types/errors'

export const SVG_MAX_BYTES = 2 * 1024 * 1024
export const SVG_MAX_SIDE = 4096

const unsafe = (name: string, why: string) => new AppError('UNSUPPORTED_TYPE', `"${name}" was not opened: ${why}. For safety, SVG files with scripts or external references are rejected.`)

/**
 * Rejects SVG features that can run code or reach the network. Rendering through <img> would already block
 * scripts and external loads, so this is defence in depth and keeps results predictable.
 */
export function assertSafeSvg(text: string, name: string): void {
  const rules: [RegExp, string][] = [
    [/<\s*script/i, 'it contains a <script> element'],
    [/<\s*foreignObject/i, 'it contains <foreignObject> (embedded HTML)'],
    [/<\s*(iframe|embed|object|audio|video)\b/i, 'it embeds external content'],
    [/\son[a-z]+\s*=/i, 'it contains event-handler attributes'],
    [/<!ENTITY|<!DOCTYPE[^>]*\[/i, 'it declares XML entities'],
    [/javascript\s*:/i, 'it contains a javascript: URL'],
    [/@import/i, 'it imports external CSS'],
    [/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);base64,)/i, 'it references an external resource'],
    [/url\(\s*["']?\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);base64,)/i, 'it references an external resource in CSS'],
  ]
  for (const [re, why] of rules) if (re.test(text)) throw unsafe(name, why)
}

export interface SvgSize { width: number; height: number }

/** Intrinsic size from width/height attributes, else the viewBox, else null. Validates it is well-formed XML. */
export function parseSvgSize(text: string, name: string): SvgSize | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new AppError('PROCESSING_FAILED', `"${name}" is not valid SVG.`)
  const num = (v: string | null) => { const m = /^\s*([\d.]+)\s*(px)?\s*$/.exec(v ?? ''); return m ? Number(m[1]) : null }
  const w = num(root.getAttribute('width')), h = num(root.getAttribute('height'))
  if (w && h) return { width: w, height: h }
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) return { width: vb[2]!, height: vb[3]! }
  return null
}

/** Output size: fit the box if given (vectors may scale up), else natural size; always within SVG_MAX_SIDE. */
export function svgRenderSize(natural: SvgSize | null, box: { maxWidth?: number; maxHeight?: number }): SvgSize {
  const base = natural ?? { width: 512, height: 512 }
  let scale = 1
  if (box.maxWidth || box.maxHeight) scale = Math.min(box.maxWidth ? box.maxWidth / base.width : Infinity, box.maxHeight ? box.maxHeight / base.height : Infinity)
  const cap = SVG_MAX_SIDE / Math.max(base.width * scale, base.height * scale)
  if (cap < 1) scale *= cap
  return { width: Math.max(1, Math.round(base.width * scale)), height: Math.max(1, Math.round(base.height * scale)) }
}

/**
 * Rasterizes a vetted SVG to a PNG File. Runs on the main thread (workers have no DOM image loader);
 * <img> mode never executes scripts or loads external resources.
 */
export async function rasterizeSvg(file: File, box: { maxWidth?: number; maxHeight?: number }): Promise<File> {
  if (file.size > SVG_MAX_BYTES) throw new AppError('FILE_TOO_LARGE', `"${file.name}" is larger than the SVG limit of ${SVG_MAX_BYTES / 1024 / 1024} MB.`)
  const text = await file.text()
  assertSafeSvg(text, file.name)
  const { width, height } = svgRenderSize(parseSvgSize(text, file.name), box)
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new AppError('PROCESSING_FAILED', `"${file.name}" could not be rendered as an image.`)); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AppError('PROCESSING_FAILED', 'Canvas is not available in this browser.')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new AppError('PROCESSING_FAILED', `"${file.name}" could not be rasterized.`)
    return new File([blob], file.name, { type: 'image/png', lastModified: file.lastModified })
  } finally { URL.revokeObjectURL(url) }
}
