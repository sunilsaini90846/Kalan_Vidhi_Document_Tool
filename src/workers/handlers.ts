import { createZip } from '@/services/archive-processing/zipCreate'
import { ARCHIVE_LIMITS } from '@/services/archive-processing/limits'
import { readZip } from '@/services/archive-processing/zipRead'
import { loadBitmap, renderImage, type OutputMime } from '@/services/image-processing/process'
import type { CompressPreset } from '@/services/image-processing/presets'
import { outputName } from '@/services/image-processing/sizing'
import { optimizeOffice } from '@/services/office-processing/optimize'
import { inspectOffice } from '@/services/office-processing/inspect'
import type { OfficeFormat } from '@/services/office-processing/formats'
import { compressPdf } from '@/services/pdf-processing/compress'
import { buildPdf } from '@/services/pdf-processing/imagesToPdf'
import type { PageSettings } from '@/services/pdf-processing/layout'
import { assertEditable, describePdf, extractPages, loadPdf, mergePdfs, rotatePages, splitPdf } from '@/services/pdf-processing/pdfOps'
import { prepareImage } from '@/features/image-to-pdf/prepare'

export type Progress = (p: { done: number; total: number }) => void

export interface ImageJob {
  file: File
  mime: OutputMime | 'same'
  quality: number
  maxWidth?: number
  maxHeight?: number
  allowEnlarge: boolean
  suffix: string
  keepIfLarger: boolean
}

const sameMime = (t: string): OutputMime => (t === 'image/png' || t === 'image/webp' ? t : 'image/jpeg')

/** Every operation that runs off the main thread. Arguments and results must be structured-cloneable. */
export const handlers = {
  async processImage(j: ImageJob) {
    const mime = j.mime === 'same' ? sameMime(j.file.type) : j.mime
    const bmp = await loadBitmap(j.file)
    const srcW = bmp.width, srcH = bmp.height
    const out = await renderImage(bmp, { mime, quality: j.quality, maxWidth: j.maxWidth, maxHeight: j.maxHeight, allowEnlarge: j.allowEnlarge, flatten: mime === 'image/jpeg' }).finally(() => bmp.close())
    const resized = out.width !== srcW || out.height !== srcH
    const keep = j.keepIfLarger && !resized && mime === sameMime(j.file.type) && out.blob.size >= j.file.size
    return keep
      ? { keptOriginal: true as const, width: out.width, height: out.height, name: j.file.name }
      : { keptOriginal: false as const, blob: out.blob, width: out.width, height: out.height, name: outputName(j.file.name, j.suffix, mime) }
  },

  async imagesToPdf(a: { files: File[]; rotations: (0 | 90 | 180 | 270)[]; settings: PageSettings; quality: number; maxDimension?: number; title: string }, progress: Progress) {
    const prepared = []
    for (const [i, file] of a.files.entries()) {
      prepared.push(await prepareImage(file, a.settings, { rotate: a.rotations[i] ?? 0, quality: a.quality, maxDimension: a.maxDimension }))
      progress({ done: i + 1, total: a.files.length })
    }
    return buildPdf(prepared, a.settings, a.title)
  },

  async inspectPdf(a: { bytes: Uint8Array; name: string }) {
    const info = describePdf(await loadPdf(a.bytes, `"${a.name}"`))
    assertEditable(info, `"${a.name}"`)
    return info
  },
  mergePdfs: (a: { sources: { name: string; bytes: Uint8Array }[] }) => mergePdfs(a.sources),
  splitPdf: (a: { bytes: Uint8Array; groups: number[][] }) => splitPdf(a.bytes, a.groups),
  extractPages: (a: { bytes: Uint8Array; pages: number[] }) => extractPages(a.bytes, a.pages),
  rotatePages: (a: { bytes: Uint8Array; pages: number[]; delta: 90 | 180 | 270 }) => rotatePages(a.bytes, a.pages, a.delta),
  compressPdf: (a: { bytes: Uint8Array; preset: CompressPreset }, progress: Progress) => compressPdf(a.bytes, a.preset, (done, total) => progress({ done, total })),

  inspectOffice: (a: { bytes: Uint8Array; format: OfficeFormat; name: string }) => inspectOffice(a.bytes, a.format, a.name),
  optimizeOffice: (a: { bytes: Uint8Array; format: OfficeFormat; name: string; preset: CompressPreset }, progress: Progress) =>
    optimizeOffice(a.bytes, a.format, a.name, a.preset, (done, total) => progress({ done, total })),

  extractZipEntry(a: { bytes: Uint8Array; name: string }) {
    const [f] = readZip(a.bytes, ARCHIVE_LIMITS, (n) => n === a.name)
    return f ? f.data : null
  },
  createZip(a: { files: { name: string; data: Uint8Array }[]; level: 0 | 6 | 9 | 'auto'; maxBytes: number }) {
    const zip = createZip(a.files, a.level)
    readZip(zip, { ...ARCHIVE_LIMITS, maxTotalBytes: a.maxBytes * 2, maxEntryBytes: a.maxBytes }) // verify it reads back
    return zip
  },
}

export type Handlers = typeof handlers
export type OpName = keyof Handlers
