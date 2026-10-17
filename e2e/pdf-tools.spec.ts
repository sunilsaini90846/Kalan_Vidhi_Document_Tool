import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { PDFDocument, StandardFonts } from 'pdf-lib'

async function textPdf(pages: number, label = 'P'): Promise<Buffer> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) d.addPage().drawText(`${label}${i}`, { font: f, size: 24, x: 50, y: 700 })
  return Buffer.from(await d.save())
}

/** PDF with one large, noisy JPEG made by the browser's own encoder. */
async function photoPdf(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200
    const ctx = c.getContext('2d')!
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 40)}%)`; ctx.fillRect((i * 7919) % 1600, (i * 104729) % 1200, 14, 14) }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 1))
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]!); r.readAsDataURL(blob) })
  })
  const d = await PDFDocument.create()
  const img = await d.embedJpg(Buffer.from(b64, 'base64'))
  const p = d.addPage([595, 842]); p.drawImage(img, { x: 0, y: 0, width: 595, height: 446 })
  return Buffer.from(await d.save())
}

const pdfFile = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer })
const input = (page: Page) => page.locator('input[type=file]')
async function download(page: Page, click: () => Promise<void>) {
  const p = page.waitForEvent('download'); await click(); const d = await p
  return { name: d.suggestedFilename(), data: readFileSync(await d.path()) }
}

test('merge combines PDFs in the chosen order', async ({ page }) => {
  await page.goto('/merge-pdf')
  await input(page).setInputFiles([pdfFile('a.pdf', await textPdf(2, 'A')), pdfFile('b.pdf', await textPdf(3, 'B'))])
  await expect(page.getByText('5 pages in total')).toBeVisible()
  await page.getByRole('button', { name: 'Move b.pdf up' }).click()
  await page.getByRole('button', { name: 'Merge PDFs' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Merged and verified: 5 pages' })).toBeVisible()
  const out = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click())
  expect(out.name).toBe('merged.pdf')
  expect((await PDFDocument.load(out.data)).getPageCount()).toBe(5)
})

test('merge rejects a file that is not a real PDF', async ({ page }) => {
  await page.goto('/merge-pdf')
  await input(page).setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf at all') })
  await expect(page.getByRole('alert')).toContainText('not a supported file type')
})

test('split every page produces a ZIP of valid one-page PDFs', async ({ page }) => {
  await page.goto('/split-pdf')
  await input(page).setInputFiles(pdfFile('doc.pdf', await textPdf(3)))
  await expect(page.getByText('3 pages')).toBeVisible()
  await page.getByRole('button', { name: 'Split PDF' }).click()
  const out = await download(page, () => page.getByRole('button', { name: /Download all/ }).click())
  const files = unzipSync(new Uint8Array(out.data))
  expect(Object.keys(files).sort()).toEqual(['doc-page-1.pdf', 'doc-page-2.pdf', 'doc-page-3.pdf'])
  for (const f of Object.values(files)) expect((await PDFDocument.load(f)).getPageCount()).toBe(1)
})

test('split by ranges and clear errors for bad ranges', async ({ page }) => {
  await page.goto('/split-pdf')
  await input(page).setInputFiles(pdfFile('doc.pdf', await textPdf(5)))
  await page.getByLabel('Ranges (one PDF per item)').check()
  await page.getByLabel('Ranges', { exact: true }).fill('1-9')
  await page.getByRole('button', { name: 'Split PDF' }).click()
  await expect(page.getByRole('alert')).toContainText('outside this document (1–5)')
  await page.getByLabel('Ranges', { exact: true }).fill('1-2, 5')
  await page.getByRole('button', { name: 'Split PDF' }).click()
  const out = await download(page, () => page.getByRole('button', { name: /Download all/ }).click())
  const files = unzipSync(new Uint8Array(out.data))
  expect(Object.keys(files).sort()).toEqual(['doc-page-5.pdf', 'doc-pages-1-2.pdf'])
})

test('extract keeps pages in typed order; delete removes pages', async ({ page }) => {
  await page.goto('/extract-pdf-pages')
  await input(page).setInputFiles(pdfFile('doc.pdf', await textPdf(5)))
  await page.getByLabel('Pages', { exact: true }).fill('4, 1')
  await page.getByRole('button', { name: 'Extract pages' }).click()
  const out = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click())
  expect(out.name).toBe('doc-extracted.pdf')
  expect((await PDFDocument.load(out.data)).getPageCount()).toBe(2)

  await page.getByLabel('Delete these pages').check()
  await page.getByLabel('Pages', { exact: true }).fill('1-5')
  await page.getByRole('button', { name: 'Delete pages' }).click()
  await expect(page.getByRole('alert')).toContainText('every page')
})

test('rotate applies only to chosen pages', async ({ page }) => {
  await page.goto('/rotate-pdf')
  await input(page).setInputFiles(pdfFile('doc.pdf', await textPdf(3)))
  await page.getByLabel('Pages (optional)').fill('2')
  await page.getByRole('button', { name: 'Rotate PDF' }).click()
  const out = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click())
  const d = await PDFDocument.load(out.data)
  expect(d.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0])
})

test('compressor really shrinks a photo PDF and keeps it valid', async ({ page }) => {
  await page.goto('/pdf-compressor')
  const src = await photoPdf(page)
  await input(page).setInputFiles(pdfFile('photo.pdf', src))
  await page.getByLabel(/Strong/).check()
  await page.getByRole('button', { name: 'Compress PDF' }).click()
  await expect(page.getByText(/% smaller/)).toBeVisible()
  await expect(page.getByText('recompressed: 1')).toBeVisible()
  const out = await download(page, () => page.getByRole('button', { name: /Download compressed PDF/ }).click())
  expect(out.name).toBe('photo-compressed.pdf')
  expect(out.data.length).toBeLessThan(src.length * 0.7)
  expect((await PDFDocument.load(out.data)).getPageCount()).toBe(1)
})

test('compressor says so when nothing can be reduced', async ({ page }) => {
  await page.goto('/pdf-compressor')
  await input(page).setInputFiles(pdfFile('text.pdf', await textPdf(2)))
  await page.getByRole('button', { name: 'Compress PDF' }).click()
  await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
})
