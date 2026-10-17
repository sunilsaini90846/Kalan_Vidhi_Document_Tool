import { AppError } from '@/types/errors'
import type { ArchiveLimits } from './limits'

export interface ZipEntryInfo {
  name: string
  compressedSize: number
  size: number
  method: number
  encrypted: boolean
  isDirectory: boolean
  unsafePath: boolean
}

const fail = (m: string) => new AppError('PROCESSING_FAILED', m)

/** Rejects absolute paths, drive letters, NULs and any ".." segment (zip-slip). */
export function isUnsafePath(name: string): boolean {
  if (name.includes('\0') || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) return true
  return name.split(/[\\/]/).some((seg) => seg === '..')
}

/** Reads the central directory without inflating anything, so limits can be checked first. */
export function listZipEntries(bytes: Uint8Array, limits?: ArchiveLimits): ZipEntryInfo[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw fail('This is not a valid ZIP archive (no central directory found).')
  const count = v.getUint16(eocd + 10, true)
  const offset = v.getUint32(eocd + 16, true)
  if (count === 0xffff || offset === 0xffffffff) throw fail('ZIP64 archives are not supported.')
  if (limits && count > limits.maxEntries) throw fail(`This archive has ${count} entries; the limit is ${limits.maxEntries}.`)

  const decoder = new TextDecoder()
  const entries: ZipEntryInfo[] = []
  let p = offset
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw fail('This ZIP archive is damaged (bad directory entry).')
    const flags = v.getUint16(p + 8, true)
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true)
    if (p + 46 + nameLen > bytes.length) throw fail('This ZIP archive is damaged (truncated directory).')
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.push({
      name, method: v.getUint16(p + 10, true),
      compressedSize: v.getUint32(p + 20, true), size: v.getUint32(p + 24, true),
      encrypted: (flags & 1) === 1, isDirectory: name.endsWith('/'), unsafePath: isUnsafePath(name),
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  if (limits) {
    const total = entries.reduce((s, e) => s + e.size, 0)
    if (total > limits.maxTotalBytes) throw fail('This archive would expand beyond the safe size limit for in-browser processing.')
    if (entries.some((e) => e.size > limits.maxEntryBytes)) throw fail('This archive contains a single file larger than the safe limit.')
  }
  return entries
}
