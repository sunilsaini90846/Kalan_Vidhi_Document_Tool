import { PDFDocument, rgb } from 'pdf-lib'
import { AppError } from '@/types/errors'
import { computeCells, imagesPerPage, pageCount, pageSize, placeImage, type PageSettings } from './layout'

export interface PdfImage { bytes: Uint8Array; kind: 'jpeg' | 'png' }

export interface BuiltPdf { bytes: Uint8Array; pageCount: number }

/** Builds the PDF, then re-opens it to verify structure and page count. */
export async function buildPdf(images: PdfImage[], s: PageSettings, title?: string): Promise<BuiltPdf> {
  if (images.length === 0) throw new AppError('PROCESSING_FAILED', 'Select at least one image.')
  const [pw, ph] = pageSize(s)
  const cells = computeCells(s)
  const per = imagesPerPage(s)
  const doc = await PDFDocument.create()
  if (title) doc.setTitle(title)
  doc.setProducer('FileSqueeze')

  let page = doc.addPage([pw, ph])
  for (const [i, img] of images.entries()) {
    if (i > 0 && i % per === 0) page = doc.addPage([pw, ph])
    if (i % per === 0) page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(1, 1, 1) })
    const embedded = img.kind === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
    const r = placeImage(cells[i % per]!, embedded.width, embedded.height)
    page.drawImage(embedded, { x: r.x, y: ph - r.y - r.height, width: r.width, height: r.height })
  }

  const bytes = await doc.save()
  const expected = pageCount(images.length, s)
  const reopened = await PDFDocument.load(bytes)
  if (reopened.getPageCount() !== expected) throw new AppError('PROCESSING_FAILED', 'The generated PDF failed validation.')
  return { bytes, pageCount: expected }
}
