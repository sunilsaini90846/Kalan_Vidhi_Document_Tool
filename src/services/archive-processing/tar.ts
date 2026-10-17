import { AppError } from '@/types/errors'
import type { ArchiveLimits } from './limits'
import { isUnsafePath } from './zipDirectory'

export interface TarEntry {
  name: string
  size: number
  /** Where the file data starts in the (decompressed) tar bytes. */
  offset: number
  type: 'file' | 'dir' | 'link' | 'other'
}

const fail = (m: string) => new AppError('PROCESSING_FAILED', m)
const BLOCK = 512
const dec = new TextDecoder()
const cstr = (b: Uint8Array) => { const z = b.indexOf(0); return dec.decode(z < 0 ? b : b.subarray(0, z)) }

function octal(b: Uint8Array): number {
  if (b[0]! & 0x80) { // GNU base-256 for sizes ≥ 8 GiB: refuse rather than guess
    throw fail('This TAR contains an entry that is too large to process in the browser.')
  }
  const s = cstr(b).trim()
  return s ? parseInt(s, 8) : 0
}

function checksumOk(h: Uint8Array): boolean {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!
  return sum === octal(h.subarray(148, 156))
}

/** Parses the entry list of a ustar/pax/GNU tar without extracting anything. Regular files only are marked `file`. */
export function parseTar(bytes: Uint8Array, limits: ArchiveLimits): TarEntry[] {
  const entries: TarEntry[] = []
  let p = 0, total = 0, longName: string | null = null, paxPath: string | null = null
  while (p + BLOCK <= bytes.length) {
    const h = bytes.subarray(p, p + BLOCK)
    if (h.every((v) => v === 0)) break
    if (!checksumOk(h)) throw fail('This TAR archive is damaged (bad header checksum).')
    const flag = String.fromCharCode(h[156]!)
    const size = octal(h.subarray(124, 136))
    const dataStart = p + BLOCK
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK
    if (next > bytes.length) throw fail('This TAR archive is truncated.')

    if (flag === 'L') { longName = cstr(bytes.subarray(dataStart, dataStart + size)); p = next; continue }
    if (flag === 'x' || flag === 'g') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(dec.decode(bytes.subarray(dataStart, dataStart + size)))
      if (flag === 'x' && m) paxPath = m[1]!
      p = next; continue
    }
    const prefix = cstr(h.subarray(345, 500))
    const name = longName ?? paxPath ?? (prefix ? `${prefix}/${cstr(h.subarray(0, 100))}` : cstr(h.subarray(0, 100)))
    longName = paxPath = null
    const type: TarEntry['type'] = flag === '0' || flag === '\0' || flag === '7' ? 'file' : flag === '5' ? 'dir' : flag === '1' || flag === '2' ? 'link' : 'other'
    if (entries.length >= limits.maxEntries) throw fail(`This archive has more than ${limits.maxEntries} entries; the limit is ${limits.maxEntries}.`)
    if (type === 'file') {
      total += size
      if (size > limits.maxEntryBytes) throw fail('This archive contains a single file larger than the safe limit.')
      if (total > limits.maxTotalBytes) throw fail('This archive would expand beyond the safe size limit for in-browser processing.')
    }
    entries.push({ name, size: type === 'file' ? size : 0, offset: dataStart, type })
    p = next
  }
  return entries
}

export const tarUnsafe = (name: string) => isUnsafePath(name)
