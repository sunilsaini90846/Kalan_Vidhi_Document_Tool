import { Gunzip } from 'fflate'
import { AppError } from '@/types/errors'
import { crc32 } from './crc32'
import type { ArchiveLimits } from './limits'
import { parseTar } from './tar'
import { isUnsafePath, listZipEntries, type ZipEntryInfo } from './zipDirectory'
import { readZip } from './zipRead'

export type ArchiveKind = 'zip' | 'tar' | 'gzip'

export interface ArchiveEntry extends ZipEntryInfo {
  /** False for links/devices (listed for transparency, never extracted), encrypted entries and unsafe paths. */
  extractable: boolean
  note?: string
}

const fail = (m: string) => new AppError('PROCESSING_FAILED', m)

/** Inflates a gzip stream, counting real output bytes and stopping the moment the limit is crossed. */
export function gunzipLimited(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = []
  let size = 0, error: AppError | null = null, done = false
  const g = new Gunzip((chunk, final) => {
    size += chunk.length
    if (size > maxBytes) { error = fail('This archive expands beyond the safe size limit and was stopped.'); return }
    chunks.push(chunk)
    if (final) done = true
  })
  try {
    for (let i = 0; i < bytes.length && !error; i += 16384) g.push(bytes.subarray(i, i + 16384), i + 16384 >= bytes.length)
  } catch { throw error ?? fail('This GZIP file is damaged or truncated.') }
  if (error) throw error
  if (!done) throw fail('This GZIP file is damaged or truncated.')
  const out = new Uint8Array(size); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  // The streaming decoder does not verify the trailer, so check CRC32 and length ourselves (catches truncation and corruption).
  const t = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8)
  if (bytes.length < 18 || t.getUint32(0, true) !== crc32(out) || t.getUint32(4, true) !== size >>> 0) throw fail('This GZIP file is damaged or truncated (checksum mismatch).')
  return out
}

const looksLikeTar = (b: Uint8Array) => b.length >= 512 && String.fromCharCode(...b.subarray(257, 262)) === 'ustar'
const stripGz = (n: string) => n.replace(/\.(gz|tgz)$/i, '') || 'file'

/** Opens zip / tar / gzip (.gz, .tar.gz, .tgz). A gzip that holds a tar is listed as a tar. */
export function listArchive(bytes: Uint8Array, kind: ArchiveKind, fileName: string, limits: ArchiveLimits): { entries: ArchiveEntry[]; note?: string } {
  if (kind === 'zip') {
    return { entries: listZipEntries(bytes, limits).map((e) => ({ ...e, extractable: !e.encrypted && !e.unsafePath })) }
  }
  const raw = kind === 'gzip' ? gunzipLimited(bytes, limits.maxTotalBytes) : bytes
  if (kind === 'gzip' && !looksLikeTar(raw)) {
    const name = stripGz(fileName)
    return { entries: [{ name, compressedSize: bytes.length, size: raw.length, method: 8, encrypted: false, isDirectory: false, unsafePath: false, extractable: true }], note: 'Single compressed file (not a TAR).' }
  }
  const entries = parseTar(raw, limits).map((e): ArchiveEntry => ({
    name: e.name, compressedSize: e.size, size: e.size, method: 0, encrypted: false, isDirectory: e.type === 'dir', unsafePath: isUnsafePath(e.name),
    extractable: e.type === 'file' && !isUnsafePath(e.name),
    note: e.type === 'link' ? 'link: never extracted' : e.type === 'other' ? 'special entry: never extracted' : undefined,
  }))
  return { entries, note: kind === 'gzip' ? 'Compressed TAR archive.' : undefined }
}

/** Extracts one regular file's bytes, re-checking the same safety rules as listing. null if not found/extractable. */
export function extractArchiveEntry(bytes: Uint8Array, kind: ArchiveKind, name: string, fileName: string, limits: ArchiveLimits): Uint8Array | null {
  if (kind === 'zip') return readZip(bytes, limits, (n) => n === name)[0]?.data ?? null
  const raw = kind === 'gzip' ? gunzipLimited(bytes, limits.maxTotalBytes) : bytes
  if (kind === 'gzip' && !looksLikeTar(raw)) return name === stripGz(fileName) ? raw : null
  const e = parseTar(raw, limits).find((x) => x.name === name && x.type === 'file')
  if (!e || isUnsafePath(e.name)) return null
  return raw.slice(e.offset, e.offset + e.size)
}
