import { expect, test } from '@playwright/test'
import { dl, encryptedPdf, expectValidPdf, pageWidths, signedPdf, textPdf, upload } from '../tool-kit'

const pagesField = (page: import('@playwright/test').Page, v: string) => page.getByLabel('Pages', { exact: true }).fill(v)

test.describe('Extract PDF Pages (keep, delete, reorder)', () => {
  test('keep: builds a new PDF from exactly the listed pages', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await expect(page.getByRole('heading', { level: 1, name: 'Extract PDF Pages' })).toBeVisible()
    await upload(page, 'doc.pdf', await textPdf(6))
    await pagesField(page, '2-3, 6')
    await page.getByRole('button', { name: 'Extract pages' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Created and verified a 3-page PDF' })).toBeVisible()
    const out = await dl(page)
    expect(out.filename).toBe('doc-extracted.pdf')
    expect(await pageWidths(out.bytes)).toEqual([320, 330, 360])
  })

  test('typed order is the output order (reorder), and a page may be repeated', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'doc.pdf', await textPdf(4))
    await pagesField(page, '4, 1, 1, 3')
    await page.getByRole('button', { name: 'Extract pages' }).click()
    expect(await pageWidths((await dl(page)).bytes)).toEqual([340, 310, 310, 330])
  })

  test('delete: removes the listed pages and keeps the rest in order', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'doc.pdf', await textPdf(5))
    await page.getByLabel('Delete these pages').check()
    await pagesField(page, '2, 4')
    await page.getByRole('button', { name: 'Delete pages' }).click()
    const out = await dl(page)
    expect(out.filename).toBe('doc-edited.pdf')
    expect(await pageWidths(out.bytes)).toEqual([310, 330, 350])
  })

  test('deleting every page is refused', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'doc.pdf', await textPdf(3))
    await page.getByLabel('Delete these pages').check()
    await pagesField(page, '1-3')
    await page.getByRole('button', { name: 'Delete pages' }).click()
    await expect(page.getByRole('alert')).toContainText('every page')
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0)
  })

  for (const [spec, message] of [['7', 'outside this document (1–3)'], ['x', 'not a valid page or range'], ['', 'Enter at least one']] as const) {
    test(`invalid pages ${JSON.stringify(spec)}: specific error`, async ({ page }) => {
      await page.goto('/extract-pdf-pages')
      await upload(page, 'doc.pdf', await textPdf(3))
      await pagesField(page, spec)
      await page.getByRole('button', { name: 'Extract pages' }).click()
      await expect(page.getByRole('alert')).toContainText(message)
    })
  }

  test('switching mode changes the action button and clears an old result', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'doc.pdf', await textPdf(3))
    await pagesField(page, '1')
    await page.getByRole('button', { name: 'Extract pages' }).click()
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible()
    await page.getByLabel('Delete these pages').check()
    await expect(page.getByRole('button', { name: 'Delete pages' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0)
  })

  test('whole-document extract keeps all pages valid', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'doc.pdf', await textPdf(3))
    await pagesField(page, '1-')
    await page.getByRole('button', { name: 'Extract pages' }).click()
    await expectValidPdf((await dl(page)).bytes, 3)
  })

  test('encrypted and signed PDFs are refused', async ({ page }) => {
    await page.goto('/extract-pdf-pages')
    await upload(page, 'locked.pdf', await encryptedPdf())
    await expect(page.getByRole('alert')).toContainText('encrypted')
    await upload(page, 'signed.pdf', await signedPdf())
    await expect(page.getByRole('alert')).toContainText('digitally signed')
  })
})
