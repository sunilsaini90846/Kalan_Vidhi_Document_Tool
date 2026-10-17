import type { DetectedKind } from '@/services/file-validation/signatures'

export interface Dimensions { width: number; height: number }

const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8)
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
const i32le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)
const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.subarray(s, Math.min(e, b.length)))

function jpeg(b: Uint8Array): Dimensions | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]!
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! }
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!)
  }
  return null
}

function webp(b: Uint8Array): Dimensions | null {
  const fmt = ascii(b, 12, 16)
  if (fmt === 'VP8X') return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) }
  if (fmt === 'VP8L' && b[20] === 0x2f) { const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0; return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 } }
  if (fmt === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  return null
}

/** Finds the `ispe` (image spatial extents) box inside the HEIF metadata. */
function avif(b: Uint8Array): Dimensions | null {
  for (let i = 4; i + 20 <= b.length; i++) if (b[i] === 0x69 && b[i + 1] === 0x73 && b[i + 2] === 0x70 && b[i + 3] === 0x65) return { width: u32be(b, i + 8), height: u32be(b, i + 12) }
  return null
}

/** Reads pixel dimensions from header bytes, without decoding. null when unknown (TIFF, ICO, SVG). */
export function readDimensions(kind: DetectedKind, b: Uint8Array): Dimensions | null {
  let d: Dimensions | null = null
  switch (kind) {
    // The first PNG chunk must be IHDR with length 13; anything else means a damaged file, not a huge one.
    case 'png': d = b.length >= 24 && u32be(b, 8) === 13 && ascii(b, 12, 16) === 'IHDR' ? { width: u32be(b, 16), height: u32be(b, 20) } : null; break
    case 'jpeg': d = jpeg(b); break
    case 'webp': d = webp(b); break
    case 'gif': d = b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null; break
    case 'bmp': d = b.length >= 26 ? (u16le(b, 14) === 12 ? { width: u16le(b, 18), height: u16le(b, 20) } : { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) }) : null; break
    case 'avif': d = avif(b); break
  }
  return d && d.width > 0 && d.height > 0 ? d : null
}
