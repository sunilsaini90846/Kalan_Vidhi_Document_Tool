import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePageSpec, parseRangeGroups } from './pageSpec'
import { complementPages, extractPages, mergePdfs, rotatePages, loadPdf, describePdf } from './pdfOps'

async function sample(pages: number, label = 'P'): Promise<Uint8Array> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) d.addPage().drawText(`${label}${i}`, { font: f, size: 24, x: 50, y: 700 })
  return d.save()
}

describe('parsePageSpec', () => {
  it('parses lists, ranges, open ranges', () => expect(parsePageSpec('1-3, 5, 8-', 9)).toEqual([1, 2, 3, 5, 8, 9]))
  it('keeps typed order (reorder)', () => expect(parsePageSpec('3,1,2', 3)).toEqual([3, 1, 2]))
  it.each(['0', '10', 'abc', '3-1', '-', ''])('rejects %j', (s) => expect(() => parsePageSpec(s, 5)).toThrow())
  it('groups per comma item', () => expect(parseRangeGroups('1-2,4', 5)).toEqual([[1, 2], [4]]))
})

describe('pdf operations', () => {
  it('merges in order and counts pages', async () => {
    const r = await mergePdfs([{ name: 'a', bytes: await sample(2, 'A') }, { name: 'b', bytes: await sample(3, 'B') }])
    expect(r.pages).toBe(5)
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(5)
  })
  it('refuses to merge fewer than two', async () => { await expect(mergePdfs([{ name: 'a', bytes: await sample(1) }])).rejects.toThrow() })
  it('extracts selected pages', async () => {
    const out = await extractPages(await sample(5), [5, 2])
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2)
  })
  it('deletes pages via complement', () => expect(complementPages(5, [2, 4])).toEqual([1, 3, 5]))
  it('rotates only chosen pages and accumulates rotation', async () => {
    let out = await rotatePages(await sample(3), [2], 90)
    out = await rotatePages(out, [2, 3], 180)
    const d = await PDFDocument.load(out)
    expect(d.getPages().map((p) => p.getRotation().angle)).toEqual([0, 270, 180])
  })
  it('reports unreadable files safely', async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3]), 'x.pdf')).rejects.toThrow(/could not be read/)
  })
  it('describes a plain PDF', async () => {
    expect(describePdf(await loadPdf(await sample(2)))).toMatchObject({ pages: 2, hasForm: false, signed: false })
  })
})
