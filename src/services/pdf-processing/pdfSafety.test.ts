import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib'
import { compressPdf } from './compress'
import { assertEditable, describePdf, loadPdf, mergePdfs, rotatePages, splitPdf, extractPages } from './pdfOps'

async function plain(pages = 2): Promise<Uint8Array> { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage(); return d.save() }

/** A structurally real encrypted PDF: the trailer carries an /Encrypt dictionary, which is what readers key on. */
async function encrypted(): Promise<Uint8Array> {
  const d = await PDFDocument.create(); d.addPage()
  const enc = d.context.obj({ Filter: 'Standard', V: 1, R: 2, O: PDFString.of('x'.repeat(32)), U: PDFString.of('y'.repeat(32)), P: -4 })
  d.context.trailerInfo.Encrypt = d.context.register(enc)
  return d.save()
}

/** A PDF whose AcroForm says it contains signatures (SigFlags=3). */
async function signed(): Promise<Uint8Array> {
  const d = await PDFDocument.create(); d.addPage()
  const form = d.context.obj({ Fields: [], SigFlags: PDFNumber.of(3) })
  d.catalog.set(PDFName.of('AcroForm'), d.context.register(form))
  return d.save()
}

async function withForm(): Promise<Uint8Array> {
  const d = await PDFDocument.create(); d.addPage().drawText('x')
  const tf = d.getForm().createTextField('name'); tf.addToPage(d.getPage(0), { x: 10, y: 10 })
  return d.save()
}

describe('encrypted PDFs', () => {
  it('are refused with a clear message by loadPdf', async () => {
    await expect(loadPdf(await encrypted(), '"locked.pdf"')).rejects.toThrow(/password-protected or encrypted/)
  })
  it('are refused by every operation', async () => {
    const e = await encrypted()
    await expect(mergePdfs([{ name: 'a', bytes: e }, { name: 'b', bytes: await plain() }])).rejects.toThrow(/encrypted/)
    await expect(extractPages(e, [1])).rejects.toThrow(/encrypted/)
    await expect(splitPdf(e, [[1]])).rejects.toThrow(/encrypted/)
    await expect(rotatePages(e, [1], 90)).rejects.toThrow(/encrypted/)
    await expect(compressPdf(e, 'balanced')).rejects.toThrow(/encrypted/)
  })
})

describe('digitally signed PDFs', () => {
  it('are detected', async () => expect(describePdf(await loadPdf(await signed())).signed).toBe(true))
  it('are refused by every operation, never silently rewritten', async () => {
    const s = await signed()
    await expect(mergePdfs([{ name: 'a', bytes: s }, { name: 'b', bytes: await plain() }])).rejects.toThrow(/digitally signed/)
    await expect(extractPages(s, [1])).rejects.toThrow(/digitally signed/)
    await expect(rotatePages(s, [1], 90)).rejects.toThrow(/digitally signed/)
    await expect(compressPdf(s, 'light')).rejects.toThrow(/digitally signed/)
  })
  it('assertEditable passes unsigned documents', async () => {
    const info = describePdf(await loadPdf(await plain()))
    expect(() => assertEditable(info, 'x')).not.toThrow()
  })
})

describe('forms and malformed input', () => {
  it('reports form fields so the UI can warn', async () => expect(describePdf(await loadPdf(await withForm())).hasForm).toBe(true))
  it('rotate keeps the form (document structure is not rebuilt)', async () => {
    const out = await rotatePages(await withForm(), [1], 90)
    expect((await PDFDocument.load(out)).getForm().getFields().map((f) => f.getName())).toEqual(['name'])
  })
  it('rejects truncated and garbage files without throwing raw parser errors', async () => {
    const good = await plain()
    await expect(loadPdf(good.subarray(0, 40), '"cut.pdf"')).rejects.toThrow(/could not be read|damaged/)
    await expect(loadPdf(new TextEncoder().encode('%PDF-1.4 not really'), '"x.pdf"')).rejects.toThrow()
  })
  it('compression of a document with no images reports zero images and no gain', async () => {
    const r = await compressPdf(await plain(3), 'strong')
    expect(r).toMatchObject({ imagesFound: 0, imagesRecompressed: 0, pages: 3 })
  })
})

