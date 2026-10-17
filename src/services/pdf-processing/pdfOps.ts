import { BRAND } from '@/config/brand'
import { EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import { AppError } from '@/types/errors'

export interface PdfInfo {
  pages: number
  hasForm: boolean
  signed: boolean
  title?: string
}

/** Load a PDF, translating parser failures into explicit, safe messages. */
export async function loadPdf(bytes: Uint8Array, name = 'This file'): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    // pdf-lib can throw its encryption error from a different copy of the class, so instanceof alone is not reliable.
    if (e instanceof EncryptedPDFError || (e instanceof Error && /\bencrypted\b/i.test(e.message))) throw new AppError('PROCESSING_FAILED', `${name} is password-protected or encrypted. Remove the protection first; encrypted PDFs are not supported.`)
    throw new AppError('PROCESSING_FAILED', `${name} could not be read as a valid PDF; it may be damaged.`)
  }
}

export function describePdf(doc: PDFDocument): PdfInfo {
  const acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)
  const sig = acro?.lookup(PDFName.of('SigFlags'))
  return {
    pages: doc.getPageCount(),
    hasForm: !!acro,
    signed: sig instanceof PDFNumber && sig.asNumber() > 0,
    title: doc.getTitle() || undefined,
  }
}

/** Digital signatures would be invalidated by any rewrite, so refuse rather than silently break them. */
export function assertEditable(info: PdfInfo, name: string): void {
  if (info.signed) throw new AppError('PROCESSING_FAILED', `${name} is digitally signed. Changing it would invalidate the signature, so it was not processed.`)
}

export const FORM_WARNING = 'This PDF contains form fields. Copying pages into a new file may not keep fields interactive.'

async function verify(bytes: Uint8Array, expectedPages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  if (doc.getPageCount() !== expectedPages) throw new AppError('PROCESSING_FAILED', 'The generated PDF failed validation.')
  return bytes
}

export async function mergePdfs(sources: { name: string; bytes: Uint8Array }[]): Promise<{ bytes: Uint8Array; pages: number }> {
  if (sources.length < 2) throw new AppError('PROCESSING_FAILED', 'Select at least two PDFs to merge.')
  const out = await PDFDocument.create()
  let total = 0
  for (const s of sources) {
    const doc = await loadPdf(s.bytes, `"${s.name}"`)
    assertEditable(describePdf(doc), `"${s.name}"`)
    const copied = await out.copyPages(doc, doc.getPageIndices())
    copied.forEach((p) => out.addPage(p))
    total += copied.length
  }
  out.setProducer(BRAND.producer)
  return { bytes: await verify(await out.save(), total), pages: total }
}

/** New PDF containing the given 1-based pages, in the given order. */
export async function extractPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  assertEditable(describePdf(src), 'This PDF')
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pages.map((p) => p - 1))
  copied.forEach((p) => out.addPage(p))
  out.setProducer(BRAND.producer)
  return verify(await out.save(), pages.length)
}

export const complementPages = (total: number, remove: number[]): number[] => {
  const drop = new Set(remove)
  return Array.from({ length: total }, (_, i) => i + 1).filter((p) => !drop.has(p))
}

/** Rotates in place (keeps the original document structure, forms included). */
export async function rotatePages(bytes: Uint8Array, pages: number[], delta: 90 | 180 | 270): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  assertEditable(describePdf(doc), 'This PDF')
  const total = doc.getPageCount()
  for (const n of pages) {
    const page = doc.getPage(n - 1)
    page.setRotation(degrees((page.getRotation().angle + delta) % 360))
  }
  return verify(await doc.save(), total)
}

/** One output PDF per page group; the source is parsed once. */
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const src = await loadPdf(bytes)
  assertEditable(describePdf(src), 'This PDF')
  const outs: Uint8Array[] = []
  for (const g of groups) {
    const out = await PDFDocument.create()
    ;(await out.copyPages(src, g.map((p) => p - 1))).forEach((p) => out.addPage(p))
    out.setProducer(BRAND.producer)
    outs.push(await verify(await out.save(), g.length))
  }
  return outs
}
