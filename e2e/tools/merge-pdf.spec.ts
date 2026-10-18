import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { dl, encryptedPdf, expectValidPdf, formPdf, pageWidths, signedPdf, textPdf, upload } from '../tool-kit'

test.describe('Merge PDF', () => {
  test('page shows accepted format; merge needs at least two valid PDFs', async ({ page }) => {
    await page.goto('/merge-pdf')
    await expect(page.getByRole('heading', { level: 1, name: 'Merge PDF' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('PDF')
    await upload(page, 'one.pdf', await textPdf(2))
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toBeDisabled()
    await upload(page, 'two.pdf', await textPdf(1))
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toBeEnabled()
  })

  test('merges in the shown order with the right total page count and page content order', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'a.pdf', await textPdf(2)) // widths 310, 320
    await upload(page, 'b.pdf', await textPdf(1)) // 310
    await expect(page.getByText('3 pages in total')).toBeVisible()
    await page.getByRole('button', { name: 'Merge PDFs' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Merged and verified: 3 pages' })).toBeVisible()
    const out = await dl(page)
    expect(out.filename).toBe('merged.pdf')
    expect(await pageWidths(out.bytes)).toEqual([310, 320, 310])
  })

  test('reordering changes the result order; remove drops a document; clear all resets', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'a.pdf', await textPdf(2)); await upload(page, 'b.pdf', await textPdf(3)); await upload(page, 'c.pdf', await textPdf(1))
    await page.getByRole('button', { name: 'Move c.pdf up' }).click()
    await page.getByRole('button', { name: 'Move c.pdf up' }).click()
    await page.getByRole('button', { name: 'Remove b.pdf' }).click()
    await expect(page.getByText('3 pages in total')).toBeVisible()
    await page.getByRole('button', { name: 'Merge PDFs' }).click()
    expect(await pageWidths((await dl(page)).bytes)).toEqual([310, 310, 320]) // c(1) then a(2)
    await page.getByRole('button', { name: /Clear all/ }).click()
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toHaveCount(0)
  })

  test('boundary arrows are disabled', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'a.pdf', await textPdf(1)); await upload(page, 'b.pdf', await textPdf(1))
    await expect(page.getByRole('button', { name: 'Move a.pdf up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move b.pdf down' })).toBeDisabled()
  })

  test('encrypted and signed PDFs are refused with their own explanations, and block merging', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'good.pdf', await textPdf(1))
    await upload(page, 'locked.pdf', await encryptedPdf())
    await upload(page, 'signed.pdf', await signedPdf())
    await expect(page.getByRole('alert').filter({ hasText: 'locked.pdf' })).toContainText('password-protected or encrypted')
    await expect(page.getByRole('alert').filter({ hasText: 'signed.pdf' })).toContainText('digitally signed')
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toBeDisabled()
    await page.getByRole('button', { name: 'Remove locked.pdf' }).click()
    await page.getByRole('button', { name: 'Remove signed.pdf' }).click()
    await upload(page, 'two.pdf', await textPdf(1))
    await expect(page.getByRole('button', { name: 'Merge PDFs' })).toBeEnabled()
  })

  test('PDFs with form fields get a visible warning but can still be merged', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'form.pdf', await formPdf()); await upload(page, 'b.pdf', await textPdf(1))
    await expect(page.getByText('has form fields')).toBeVisible()
    await page.getByRole('button', { name: 'Merge PDFs' }).click()
    await expectValidPdf((await dl(page)).bytes, 2)
  })

  test('non-PDF, truncated and empty files are rejected', async ({ page }) => {
    await page.goto('/merge-pdf')
    await upload(page, 'fake.pdf', Buffer.from('not a pdf at all'))
    await expect(page.getByRole('alert')).toContainText('not a supported file type')
    await upload(page, 'empty.pdf', Buffer.alloc(0))
    await expect(page.getByRole('alert')).toContainText('empty')
    await upload(page, 'cut.pdf', (await textPdf(2)).subarray(0, 60))
    await expect(page.getByRole('alert').filter({ hasText: 'cut.pdf' })).toContainText(/could not be read|damaged/)
  })

  test('merging many documents keeps every page', async ({ page }) => {
    await page.goto('/merge-pdf')
    for (let i = 1; i <= 6; i++) await upload(page, `d${i}.pdf`, await textPdf(i))
    await page.getByRole('button', { name: 'Merge PDFs' }).click()
    const out = await dl(page)
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(21)
  })
})
