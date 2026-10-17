import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { addImages } from './helpers'

async function makePdf(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Create PDF' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'PDF ready and verified' })).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Download .*\.pdf/ }).click()
  const d = await dl
  return { name: d.suggestedFilename(), pdf: await PDFDocument.load(readFileSync(await d.path())) }
}

const three = [
  { name: 'a.jpg', mime: 'image/jpeg' as const, w: 600, h: 400 },
  { name: 'b.png', mime: 'image/png' as const, w: 300, h: 500, transparent: true },
  { name: 'c.webp', mime: 'image/webp' as const, w: 400, h: 400 },
]

test('multiple images become one PDF with one page each', async ({ page }) => {
  await page.goto('/image-to-pdf')
  await addImages(page, three)
  await expect(page.getByRole('status').first()).toContainText('3 images')
  const { name, pdf } = await makePdf(page)
  expect(name).toBe('images.pdf')
  expect(pdf.getPageCount()).toBe(3)
  const p = pdf.getPage(0)
  expect(Math.round(p.getWidth())).toBe(595) // A4 portrait
})

test('order, removal, landscape Letter and grid are reflected in the PDF', async ({ page }) => {
  await page.goto('/image-to-pdf')
  await addImages(page, three)
  await page.getByRole('button', { name: 'Move c.webp up' }).click()
  const names = await page.getByRole('list', { name: /page order/ }).locator('p.font-medium').allTextContents()
  expect(names).toEqual(['a.jpg', 'c.webp', 'b.png'])
  await page.getByRole('button', { name: 'Remove b.png' }).click()
  await page.getByLabel('Page size').selectOption('letter')
  await page.getByLabel('Orientation').selectOption('landscape')
  const { pdf } = await makePdf(page)
  expect(pdf.getPageCount()).toBe(2)
  expect([Math.round(pdf.getPage(0).getWidth()), Math.round(pdf.getPage(0).getHeight())]).toEqual([792, 612])

  await page.getByLabel('Columns', { exact: true }).fill('2')
  const grid = await makePdf(page)
  expect(grid.pdf.getPageCount()).toBe(1)
})

test('rotation is accepted and clear-all resets', async ({ page }) => {
  await page.goto('/image-to-pdf')
  await addImages(page, three.slice(0, 1))
  await page.getByRole('button', { name: 'Rotate a.jpg' }).click()
  await expect(page.getByText('rotated 90°')).toBeVisible()
  const { pdf } = await makePdf(page)
  expect(pdf.getPageCount()).toBe(1)
  await page.getByRole('button', { name: /Clear all/ }).click()
  await expect(page.getByRole('button', { name: 'Create PDF' })).toHaveCount(0)
})
