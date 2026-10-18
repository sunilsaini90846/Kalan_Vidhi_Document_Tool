import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { dl, encryptedPdf, formPdf, pageRotations, signedPdf, textPdf, upload } from '../tool-kit'

const rotate = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Rotate PDF' }).click()

test.describe('Rotate PDF', () => {
  test('empty page list rotates every page', async ({ page }) => {
    await page.goto('/rotate-pdf')
    await expect(page.getByRole('heading', { level: 1, name: 'Rotate PDF' })).toBeVisible()
    await upload(page, 'doc.pdf', await textPdf(3))
    await rotate(page)
    await expect(page.getByRole('status').filter({ hasText: 'Rotated 3 pages by 90°' })).toBeVisible()
    const out = await dl(page)
    expect(out.filename).toBe('doc-rotated.pdf')
    expect(await pageRotations(out.bytes)).toEqual([90, 90, 90])
  })

  for (const angle of [90, 180, 270]) {
    test(`rotates only the chosen pages by ${angle}°`, async ({ page }) => {
      await page.goto('/rotate-pdf')
      await upload(page, 'doc.pdf', await textPdf(4))
      await page.getByLabel('Rotate clockwise by').selectOption(String(angle))
      await page.getByLabel('Pages (optional)').fill('2, 4')
      await rotate(page)
      expect(await pageRotations((await dl(page)).bytes)).toEqual([0, angle, 0, angle])
    })
  }

  test('a range works, and repeating a page in the list rotates it once', async ({ page }) => {
    await page.goto('/rotate-pdf')
    await upload(page, 'doc.pdf', await textPdf(5))
    await page.getByLabel('Pages (optional)').fill('2-3, 3')
    await rotate(page)
    expect(await pageRotations((await dl(page)).bytes)).toEqual([0, 90, 90, 0, 0])
  })

  test('rotation accumulates with the original rotation of the page', async ({ page }) => {
    await page.goto('/rotate-pdf')
    const d = await PDFDocument.create(); d.addPage().setRotation((await import('pdf-lib')).degrees(90)); d.addPage()
    await upload(page, 'pre.pdf', Buffer.from(await d.save()))
    await page.getByLabel('Rotate clockwise by').selectOption('180')
    await rotate(page)
    expect(await pageRotations((await dl(page)).bytes)).toEqual([270, 180])
  })

  test('page size and count are unchanged', async ({ page }) => {
    await page.goto('/rotate-pdf')
    await upload(page, 'doc.pdf', await textPdf(3))
    await rotate(page)
    const doc = await PDFDocument.load((await dl(page)).bytes)
    expect(doc.getPageCount()).toBe(3)
    expect(Math.round(doc.getPage(1).getWidth())).toBe(320)
  })

  test('form fields survive rotation (the document is edited in place)', async ({ page }) => {
    await page.goto('/rotate-pdf')
    await upload(page, 'form.pdf', await formPdf())
    await expect(page.getByText(/form fields/)).toBeVisible()
    await rotate(page)
    const doc = await PDFDocument.load((await dl(page)).bytes)
    expect(doc.getForm().getFields().map((f) => f.getName())).toEqual(['name'])
  })

  test('out-of-range pages, bad syntax, encrypted and signed files are all refused clearly', async ({ page }) => {
    await page.goto('/rotate-pdf')
    await upload(page, 'doc.pdf', await textPdf(2))
    await page.getByLabel('Pages (optional)').fill('5')
    await rotate(page)
    await expect(page.getByRole('alert')).toContainText('outside this document (1–2)')
    await page.getByLabel('Pages (optional)').fill('one')
    await rotate(page)
    await expect(page.getByRole('alert')).toContainText('not a valid page or range')
    await page.getByRole('button', { name: 'Choose another PDF' }).click()
    await upload(page, 'locked.pdf', await encryptedPdf())
    await expect(page.getByRole('alert')).toContainText('encrypted')
    await upload(page, 'signed.pdf', await signedPdf())
    await expect(page.getByRole('alert')).toContainText('digitally signed')
  })
})
