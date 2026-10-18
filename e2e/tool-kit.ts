import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString, StandardFonts } from 'pdf-lib'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { fixtureBytes } from './helpers'

/** Every tool spec uses these so tests describe behaviour, not plumbing. */

export const fileInput = (page: Page, n = 0) => page.locator('input[type=file]').nth(n)

export async function upload(page: Page, name: string, data: Uint8Array | Buffer, opts: { n?: number; mime?: string } = {}) {
  const input = fileInput(page, opts.n ?? 0)
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({ name, mimeType: opts.mime ?? 'application/octet-stream', buffer: Buffer.from(data) })
}

export async function saved(page: Page, click: () => Promise<void>) {
  const p = page.waitForEvent('download'); await click(); const d = await p
  return { filename: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(await d.path())) }
}

export const dl = (page: Page, name: string | RegExp = 'Download') => saved(page, () => page.getByRole('button', { name, exact: typeof name === 'string' }).click())

// ---------- PDFs ----------
export async function textPdf(pages: number, label = 'P'): Promise<Buffer> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) d.addPage([300 + i * 10, 400]).drawText(`${label}${i}`, { font: f, size: 24, x: 50, y: 300 })
  return Buffer.from(await d.save())
}

/** Pages get distinct widths (310, 320, ...) so tests can tell which page ended up where. */
export const pageWidths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getWidth()))
export const pageRotations = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => p.getRotation().angle)

export async function encryptedPdf(): Promise<Buffer> {
  const d = await PDFDocument.create(); d.addPage()
  d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, O: PDFString.of('x'.repeat(32)), U: PDFString.of('y'.repeat(32)), P: -4 }))
  return Buffer.from(await d.save())
}
export async function signedPdf(): Promise<Buffer> {
  const d = await PDFDocument.create(); d.addPage()
  d.catalog.set(PDFName.of('AcroForm'), d.context.register(d.context.obj({ Fields: [], SigFlags: PDFNumber.of(3) })))
  return Buffer.from(await d.save())
}
export async function formPdf(): Promise<Buffer> {
  const d = await PDFDocument.create(); const p = d.addPage()
  d.getForm().createTextField('name').addToPage(p, { x: 10, y: 10 })
  return Buffer.from(await d.save())
}
/** A PDF whose single page carries a real 400x300 JPEG photo. */
export async function photoPdf(jpeg = 'photo-q95.jpg'): Promise<Buffer> {
  const d = await PDFDocument.create(); const img = await d.embedJpg(fixtureBytes(jpeg))
  d.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 446 })
  return Buffer.from(await d.save())
}
/** The raw JPEG (DCT) streams embedded in a PDF. */
export async function embeddedJpegs(pdf: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(pdf); const out: Uint8Array[] = []
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image') && o.dict.lookup(PDFName.of('Filter')) === PDFName.of('DCTDecode')) out.push(o.contents)
  }
  return out
}
export async function hasSoftMask(pdf: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(pdf)
  for (const [, o] of doc.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream && o.dict instanceof PDFDict && o.dict.has(PDFName.of('SMask'))) return true
  return false
}

// ---------- packages ----------
export const stored = (s: string): [Uint8Array, { level: 0 }] => [strToU8(s), { level: 0 }]
const OOXML = {
  docx: ['word/document.xml', 'wordprocessingml.document.main+xml', 'word/media/'],
  pptx: ['ppt/presentation.xml', 'presentationml.presentation.main+xml', 'ppt/media/'],
  xlsx: ['xl/workbook.xml', 'spreadsheetml.sheet.main+xml', 'xl/media/'],
} as const
export function ooxml(kind: keyof typeof OOXML, media: Record<string, Uint8Array> = {}, extra: Zippable = {}): Buffer {
  const [main, ct, dir] = OOXML[kind]
  const files: Zippable = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${ct}"/></Types>`),
    '_rels/.rels': strToU8('<Relationships/>'), [main]: strToU8('<root>text =SUM(A1:A3)</root>'), ...extra,
  }
  for (const [n, d] of Object.entries(media)) files[dir + n] = d
  return Buffer.from(zipSync(files))
}
export const mediaDir = (kind: keyof typeof OOXML) => OOXML[kind][2]
export const jpegFixture = () => new Uint8Array(fixtureBytes('photo-q95.jpg'))

export async function expectValidPdf(bytes: Uint8Array, pages: number) {
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages)
}

/** A PDF with `n` separate, large, noisy JPEG images made by the browser's own encoder (so recompression takes real time). */
export async function manyPhotosPdf(page: Page, n: number): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500
    const ctx = c.getContext('2d')!
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 40)}%)`; ctx.fillRect((i * 7919) % 2000, (i * 104729) % 1500, 14, 14) }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 1))
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]!); r.readAsDataURL(blob) })
  })
  const jpeg = Buffer.from(b64, 'base64')
  const d = await PDFDocument.create()
  for (let i = 0; i < n; i++) { const img = await d.embedJpg(new Uint8Array(jpeg)); d.addPage([300, 225]).drawImage(img, { x: 0, y: 0, width: 300, height: 225 }) }
  return Buffer.from(await d.save())
}
