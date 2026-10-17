import type { DetectedKind } from '@/services/file-validation/signatures'

export interface AnimationInfo { animated: boolean; frames?: number }

const none: AnimationInfo = { animated: false }
const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.subarray(s, Math.min(e, b.length)))

function skipSubBlocks(b: Uint8Array, p: number): number {
  while (p < b.length && b[p] !== 0) p += b[p]! + 1
  return p + 1
}

/** Counts GIF image frames by walking the block structure (needs the whole file for an exact count). */
export function gifFrames(b: Uint8Array): number {
  if (b.length < 13) return 0
  let p = 13
  if (b[10]! & 0x80) p += 3 * 2 ** ((b[10]! & 7) + 1)
  let frames = 0
  while (p < b.length) {
    const t = b[p]
    if (t === 0x3b) break
    if (t === 0x21) p = skipSubBlocks(b, p + 2)
    else if (t === 0x2c) {
      frames++
      const flags = b[p + 9] ?? 0
      p += 10
      if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1)
      p = skipSubBlocks(b, p + 1)
    } else break
    if (frames > 1) break // we only need to know "more than one"
  }
  return frames
}

/** PNG is animated (APNG) when an acTL chunk appears before the first IDAT. */
export function isApng(b: Uint8Array): boolean {
  let p = 8
  while (p + 8 <= b.length) {
    const len = ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0
    const type = ascii(b, p + 4, p + 8)
    if (type === 'acTL') return true
    if (type === 'IDAT' || type === 'IEND') return false
    p += 12 + len
  }
  return false
}

/** Animated WebP sets the animation flag in the VP8X chunk. */
export function isAnimatedWebp(b: Uint8Array): boolean {
  return ascii(b, 12, 16) === 'VP8X' && (b[20]! & 0x02) !== 0
}

/** Animated AVIF uses the 'avis' brand. */
export function isAnimatedAvif(b: Uint8Array): boolean {
  const size = Math.min(((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0, b.length)
  for (let i = 8; i + 4 <= size; i += i === 8 ? 8 : 4) if (ascii(b, i, i + 4) === 'avis') return true
  return false
}

/** `bytes` must be the whole file for GIF (exact frame count) and may be a prefix for the other formats. */
export function detectAnimation(kind: DetectedKind, bytes: Uint8Array): AnimationInfo {
  switch (kind) {
    case 'gif': { const frames = gifFrames(bytes); return { animated: frames > 1, frames } }
    case 'png': return isApng(bytes) ? { animated: true } : none
    case 'webp': return isAnimatedWebp(bytes) ? { animated: true } : none
    case 'avif': return isAnimatedAvif(bytes) ? { animated: true } : none
    default: return none
  }
}
