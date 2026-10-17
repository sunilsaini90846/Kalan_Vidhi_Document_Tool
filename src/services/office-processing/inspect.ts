import { ARCHIVE_LIMITS } from '@/services/archive-processing/limits'
import { listZipEntries } from '@/services/archive-processing/zipDirectory'
import { readZip, type ZipFile } from '@/services/archive-processing/zipRead'
import { detectKind } from '@/services/file-validation/signatures'
import { AppError } from '@/types/errors'
import { MACRO_EXTENSIONS, OFFICE, type OfficeFormat } from './formats'

export type MediaKind = 'jpeg' | 'png' | 'other'
export interface MediaInfo { name: string; kind: MediaKind; ext: string; size: number; /** can this tool safely re-encode it? */ optimizable: boolean; note?: string }
export interface OfficeInfo {
  parts: number
  uncompressedSize: number
  media: MediaInfo[]
}

const fail = (m: string) => new AppError('PROCESSING_FAILED', m)

/** Number of colour components in a JPEG (1 gray, 3 YCbCr/RGB, 4 CMYK) from its SOF marker. */
export function jpegComponents(d: Uint8Array): number | null {
  let i = 2
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) { i++; continue }
    const m = d[i + 1]!
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    const len = (d[i + 2]! << 8) | d[i + 3]!
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return d[i + 9]!
    i += 2 + len
  }
  return null
}

export function describeMedia(name: string, data: Uint8Array): MediaInfo {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const kind = detectKind(data.subarray(0, 16))
  const base = { name, ext, size: data.length }
  if (kind === 'jpeg' && (ext === 'jpg' || ext === 'jpeg')) {
    const c = jpegComponents(data)
    return c === 1 || c === 3 ? { ...base, kind: 'jpeg', optimizable: true } : { ...base, kind: 'jpeg', optimizable: false, note: 'CMYK JPEG left untouched' }
  }
  if (kind === 'png' && ext === 'png') return { ...base, kind: 'png', optimizable: true, note: 'only resized when the preset downsizes' }
  return { ...base, kind: 'other', optimizable: false, note: kind === 'unknown' ? `${ext.toUpperCase()} left untouched` : 'extension does not match content; left untouched' }
}

/** Checks the package is the expected, non-macro OOXML format and returns the parsed parts. */
export function readOfficePackage(bytes: Uint8Array, format: OfficeFormat, fileName: string): ZipFile[] {
  if (MACRO_EXTENSIONS.test(fileName)) throw fail('Macro-enabled files (DOCM, XLSM, PPTM) are not supported.')
  const def = OFFICE[format]
  const dir = listZipEntries(bytes, ARCHIVE_LIMITS)
  const names = new Set(dir.map((e) => e.name))
  if (!names.has('[Content_Types].xml') || !names.has(def.mainPart)) throw fail(`This does not look like a valid ${format.toUpperCase()} file.`)
  if ([...names].some((n) => /vbaProject\.bin$/i.test(n))) throw fail('This file contains macros (VBA). Macro-enabled files are not supported.')
  const files = readZip(bytes, ARCHIVE_LIMITS)
  const types = new TextDecoder().decode(files.find((f) => f.name === '[Content_Types].xml')?.data ?? new Uint8Array())
  if (/macroEnabled/i.test(types)) throw fail('This file is macro-enabled. Macro-enabled files are not supported.')
  if (!types.includes(def.mainContentType)) throw fail(`This does not look like a valid ${format.toUpperCase()} file.`)
  return files
}

export const isMediaPart = (name: string, format: OfficeFormat) => name.startsWith(OFFICE[format].mediaDir)

export function inspectOffice(bytes: Uint8Array, format: OfficeFormat, fileName: string): OfficeInfo {
  const files = readOfficePackage(bytes, format, fileName)
  return {
    parts: files.length,
    uncompressedSize: files.reduce((s, f) => s + f.data.length, 0),
    media: files.filter((f) => isMediaPart(f.name, format)).map((f) => describeMedia(f.name, f.data)),
  }
}
