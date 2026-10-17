import { zipSync, type Zippable } from 'fflate'
import { uniqueNames } from '@/services/downloads/download'
import { AppError } from '@/types/errors'
import type { ZipFile } from './zipRead'

/** Formats that are already compressed; deflating them again gains (almost) nothing. */
const COMPRESSED_EXT = /\.(jpe?g|png|gif|webp|avif|zip|gz|7z|rar|mp3|mp4|m4a|mov|mkv|webm|pdf|docx|pptx|xlsx|jar|woff2?)$/i

/** ODF and EPUB require the `mimetype` entry to be stored uncompressed, which this guarantees for repacked packages. */
export const safeEntryName = (n: string) => n.replace(/[\\/:*?"<>|\0]/g, '_').replace(/^\.+/, '_') || 'file'

/**
 * `keepPaths` is for repacking an archive whose entry paths were already validated (Office files);
 * otherwise names are flattened and sanitised, which is what you want for user-selected files.
 */
export function createZip(files: ZipFile[], level: 0 | 6 | 9 | 'auto' = 'auto', keepPaths = false): Uint8Array {
  if (files.length === 0) throw new AppError('PROCESSING_FAILED', 'Add at least one file.')
  const names = uniqueNames(files.map((f) => (keepPaths ? f.name : safeEntryName(f.name))))
  const z: Zippable = {}
  files.forEach((f, i) => { z[names[i]!] = [f.data, { level: f.name === 'mimetype' ? 0 : level === 'auto' ? (COMPRESSED_EXT.test(f.name) ? 0 : 6) : level }] })
  return zipSync(z)
}
