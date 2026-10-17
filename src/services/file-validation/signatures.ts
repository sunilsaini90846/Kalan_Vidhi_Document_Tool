export type DetectedKind =
  | 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'tiff' | 'avif' | 'heic' | 'ico' | 'svg'
  | 'pdf' | 'zip' | 'rtf' | 'text'
  | 'gzip' | 'tar' | '7z' | 'rar'
  | 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'flac'
  | 'unknown'

export const HEAD_BYTES = 512

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, Math.min(end, b.length)))

const AVIF_BRANDS = new Set(['avif', 'avis'])
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

/** Brands from an ISO-BMFF `ftyp` box: the major brand plus compatible brands. */
function ftypBrands(b: Uint8Array): string[] {
  const size = Math.min(((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0, b.length)
  const brands = [ascii(b, 8, 12)]
  for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(b, i, i + 4))
  return brands
}

function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return false
  for (const v of b) if (v === 0 || (v < 9) || (v > 13 && v < 32 && v !== 27)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true } catch {
    // a multi-byte character may be cut at the end of the sample
    try { new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, b.length - 3)); return true } catch { return false }
  }
}

function looksLikeSvg(b: Uint8Array): boolean {
  const s = new TextDecoder().decode(b).replace(/^﻿/, '').trimStart().toLowerCase()
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(s)
}

const BMP_DIB = new Set([12, 40, 52, 56, 64, 108, 124])

/** Identify a file by its leading bytes (up to HEAD_BYTES). Content only; never trusts name or MIME type. */
export function detectKind(head: Uint8Array): DetectedKind {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46])) {
    if (startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
    if (startsWith(head, [0x57, 0x41, 0x56, 0x45], 8)) return 'wav'
  }
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38]) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return 'gif'
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  if (startsWith(head, [0x42, 0x4d]) && head.length >= 18 && BMP_DIB.has(head[14]! | (head[15]! << 8) | (head[16]! << 16) | (head[17]! << 24))) return 'bmp'
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
  if (startsWith(head, [0x00, 0x00, 0x01, 0x00]) && (head[4]! | (head[5]! << 8)) > 0) return 'ico'
  if (startsWith(head, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return 'rtf'
  if (startsWith(head, [0x1f, 0x8b])) return 'gzip'
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z'
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return 'rar'
  if (ascii(head, 257, 262) === 'ustar') return 'tar'
  if (startsWith(head, [0x66, 0x4c, 0x61, 0x43])) return 'flac'
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'
  if (startsWith(head, [0x49, 0x44, 0x33]) || (head[0] === 0xff && ((head[1]! & 0xe6) === 0xe2))) return 'mp3'
  if (ascii(head, 4, 8) === 'ftyp') {
    const brands = ftypBrands(head)
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif'
    if (brands.some((x) => HEIC_BRANDS.has(x))) return 'heic'
    return brands[0] === 'qt  ' ? 'mov' : 'mp4'
  }
  if (looksLikeSvg(head)) return 'svg'
  if (looksLikeText(head)) return 'text'
  return 'unknown'
}

export function readHead(file: Blob, length = HEAD_BYTES): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file.slice(0, length))
  })
}
