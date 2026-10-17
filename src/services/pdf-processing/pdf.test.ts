import { PDFDocument } from 'pdf-lib'
import { computeCells, pageCount, pageSize, placeImage, type PageSettings } from './layout'
import { buildPdf } from './imagesToPdf'
import { uniqueNames } from '../downloads/download'

// 1x1 transparent PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const base: PageSettings = { preset: 'a4', orientation: 'portrait', marginPt: 20, cols: 1, rows: 1, spacingPt: 0, fit: 'fit' }

describe('layout', () => {
  it('orients pages', () => {
    expect(pageSize(base)[0]).toBeLessThan(pageSize(base)[1])
    const [w, h] = pageSize({ ...base, orientation: 'landscape' })
    expect(w).toBeGreaterThan(h)
  })
  it('computes grid cells with spacing', () => {
    const cells = computeCells({ ...base, cols: 2, rows: 2, spacingPt: 10 })
    expect(cells).toHaveLength(4)
    expect(cells[1]!.x).toBeCloseTo(cells[0]!.x + cells[0]!.width + 10)
  })
  it('rejects margins that leave no room', () => expect(() => computeCells({ ...base, marginPt: 400 })).toThrow())
  it('centres and preserves aspect', () => {
    const r = placeImage({ x: 0, y: 0, width: 100, height: 100 }, 200, 100)
    expect(r).toEqual({ x: 0, y: 25, width: 100, height: 50 })
  })
  it('counts pages', () => expect(pageCount(5, { cols: 2, rows: 1 })).toBe(3))
})

describe('buildPdf', () => {
  it('one image per page by default, in order', async () => {
    const { bytes, pageCount: n } = await buildPdf([{ bytes: PNG, kind: 'png' }, { bytes: PNG, kind: 'png' }, { bytes: PNG, kind: 'png' }], base)
    expect(n).toBe(3)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)
  })
  it('grid layout packs several images per page', async () => {
    const r = await buildPdf(Array(5).fill({ bytes: PNG, kind: 'png' }), { ...base, cols: 2, rows: 2 })
    expect(r.pageCount).toBe(2)
  })
  it('applies landscape page size', async () => {
    const { bytes } = await buildPdf([{ bytes: PNG, kind: 'png' }], { ...base, orientation: 'landscape', preset: 'letter' })
    const p = (await PDFDocument.load(bytes)).getPage(0)
    expect(p.getWidth()).toBe(792)
    expect(p.getHeight()).toBe(612)
  })
  it('rejects an empty selection', async () => { await expect(buildPdf([], base)).rejects.toMatchObject({ code: 'PROCESSING_FAILED' }) })
})

describe('uniqueNames', () => {
  it('dedupes', () => expect(uniqueNames(['a.png', 'a.png', 'b'])).toEqual(['a.png', 'a (2).png', 'b']))
})
