import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import { AppError } from '@/types/errors'
import type { ArchiveLimits } from './limits'
import { isUnsafePath, listZipEntries } from './zipDirectory'

export interface ZipFile { name: string; data: Uint8Array }

const SLICE = 16 * 1024
const fail = (m: string) => new AppError('PROCESSING_FAILED', m)

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/**
 * Streams entries out of a ZIP, counting the bytes that are *actually* inflated (headers can lie)
 * and aborting as soon as a limit is crossed. Encrypted, unsafe-path and unsupported entries are refused.
 * Directory entries are skipped. `only` limits which entries are inflated.
 */
export function readZip(bytes: Uint8Array, limits: ArchiveLimits, only?: (name: string) => boolean): ZipFile[] {
  const dir = listZipEntries(bytes, limits)
  if (dir.some((e) => e.encrypted)) throw fail('This archive is password-protected; encrypted ZIPs are not supported.')
  if (dir.some((e) => e.method !== 0 && e.method !== 8)) throw fail('This archive uses a compression method that is not supported.')
  if (dir.some((e) => e.unsafePath)) throw fail('This archive contains an unsafe file path and was rejected.')

  const out: ZipFile[] = []
  let total = 0
  let failure: AppError | null = null
  const uz = new Unzip()
  uz.register(UnzipInflate)
  uz.register(UnzipPassThrough)
  uz.onfile = (f) => {
    if (failure || f.name.endsWith('/') || isUnsafePath(f.name) || (only && !only(f.name))) return
    const chunks: Uint8Array[] = []; let size = 0
    f.ondata = (err, chunk, final) => {
      if (failure) return
      if (err) { failure = fail('This ZIP archive is damaged.'); f.terminate(); return }
      size += chunk.length; total += chunk.length
      if (size > limits.maxEntryBytes || total > limits.maxTotalBytes) { failure = fail('This archive expands beyond the safe size limit and was stopped.'); f.terminate(); return }
      chunks.push(chunk)
      if (final) out.push({ name: f.name, data: concat(chunks, size) })
    }
    f.start()
  }
  try {
    for (let i = 0; i < bytes.length && !failure; i += SLICE) uz.push(bytes.subarray(i, i + SLICE), i + SLICE >= bytes.length)
  } catch {
    throw failure ?? fail('This ZIP archive is damaged or uses an unsupported feature.')
  }
  if (failure) throw failure
  return out
}
