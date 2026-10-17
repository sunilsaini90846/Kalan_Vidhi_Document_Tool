export interface Box { maxWidth?: number; maxHeight?: number }

/** Fit (w,h) inside the box keeping aspect ratio. Never enlarges unless allowed. */
export function targetSize(w: number, h: number, box: Box, allowEnlarge = false): { width: number; height: number } {
  const sx = box.maxWidth ? box.maxWidth / w : Infinity
  const sy = box.maxHeight ? box.maxHeight / h : Infinity
  let scale = Math.min(sx, sy)
  if (!Number.isFinite(scale)) scale = 1
  if (!allowEnlarge) scale = Math.min(scale, 1)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

export function savedPercent(original: number, output: number): number {
  return original === 0 ? 0 : ((original - output) / original) * 100
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const extensionFor = (mime: string) => EXT[mime] ?? 'bin'

export function outputName(original: string, suffix: string, mime: string): string {
  const dot = original.lastIndexOf('.')
  const base = dot > 0 ? original.slice(0, dot) : original
  return `${base}${suffix}.${extensionFor(mime)}`
}
