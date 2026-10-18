import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { dl, encryptedPdf, expectValidPdf, pageWidths, signedPdf, textPdf, upload } from '../tool-kit'

const split = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Split PDF' }).click()
const ranges = async (page: import('@playwright/test').Page, spec: string) => {
  await page.getByLabel('Ranges (one PDF per item)').check()
  await page.getByLabel('Ranges', { exact: true }).fill(spec)
}

test.describe('Split PDF', () => {
  test('shows file information after choosing a PDF', async ({ page }) => {
    await page.goto('/split-pdf')
    await expect(page.getByRole('heading', { level: 1, name: 'Split PDF' })).toBeVisible()
    await upload(page, 'doc.pdf', await textPdf(4))
    await expect(page.getByText(/4 pages/)).toBeVisible()
    await expect(page.getByText('doc.pdf').first()).toBeVisible()
  })

  test('every page: one valid single-page PDF each, in a ZIP, in page order', async ({ page }) => {
    await page.goto('/split-pdf')
    await upload(page, 'doc.pdf', await textPdf(3))
    await split(page)
    await expect(page.getByRole('status').filter({ hasText: 'Created and verified 3 PDFs' })).toBeVisible()
    const zip = unzipSync((await dl(page, /Download all/)).bytes)
    expect(Object.keys(zip).sort()).toEqual(['doc-page-1.pdf', 'doc-page-2.pdf', 'doc-page-3.pdf'])
    expect(await pageWidths(zip['doc-page-2.pdf']!)).toEqual([320]) // really page 2
  })

  test('ranges: each comma item becomes its own PDF with the right pages', async ({ page }) => {
    await page.goto('/split-pdf')
    await upload(page, 'doc.pdf', await textPdf(6))
    await ranges(page, '1-2, 4, 5-')
    await split(page)
    const zip = unzipSync((await dl(page, /Download all/)).bytes)
    expect(Object.keys(zip).sort()).toEqual(['doc-page-4.pdf', 'doc-pages-1-2.pdf', 'doc-pages-5-6.pdf'])
    expect(await pageWidths(zip['doc-pages-5-6.pdf']!)).toEqual([350, 360])
  })

  test('a single output downloads directly as a PDF (no ZIP)', async ({ page }) => {
    await page.goto('/split-pdf')
    await upload(page, 'doc.pdf', await textPdf(5))
    await ranges(page, '2-3')
    await split(page)
    await expect(page.getByRole('button', { name: /Download all/ })).toHaveCount(0)
    const out = await dl(page)
    expect(out.filename).toBe('doc-pages-2-3.pdf')
    await expectValidPdf(out.bytes, 2)
  })

  for (const [spec, message] of [['0', 'outside this document'], ['9', 'outside this document (1–3)'], ['3-1', 'runs backwards'], ['abc', 'not a valid page or range'], ['', 'Enter at least one']] as const) {
    test(`invalid range ${JSON.stringify(spec)} gives a specific error`, async ({ page }) => {
      await page.goto('/split-pdf')
      await upload(page, 'doc.pdf', await textPdf(3))
      await ranges(page, spec); await split(page)
      await expect(page.getByRole('alert')).toContainText(message)
      await expect(page.getByRole('button', { name: /Download/ })).toHaveCount(0)
    })
  }

  test('process another file resets the tool', async ({ page }) => {
    await page.goto('/split-pdf')
    await upload(page, 'doc.pdf', await textPdf(2))
    await split(page)
    await page.getByRole('button', { name: 'Process another file' }).click()
    await expect(page.getByText(/Accepted:/)).toBeVisible()
  })

  test('encrypted, signed and fake PDFs are refused at selection', async ({ page }) => {
    await page.goto('/split-pdf')
    await upload(page, 'locked.pdf', await encryptedPdf())
    await expect(page.getByRole('alert')).toContainText('password-protected or encrypted')
    await upload(page, 'signed.pdf', await signedPdf())
    await expect(page.getByRole('alert')).toContainText('digitally signed')
    await upload(page, 'fake.pdf', Buffer.from('hello'))
    await expect(page.getByRole('alert').filter({ hasText: 'fake.pdf' })).toContainText('not a supported file type')
  })
})
