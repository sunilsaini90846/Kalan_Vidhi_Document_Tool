import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { decodeInBrowser } from '../helpers'
import { dl, embeddedJpegs, encryptedPdf, manyPhotosPdf, photoPdf, signedPdf, textPdf, upload } from '../tool-kit'

const compress = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Compress PDF' }).click()
const preset = (page: import('@playwright/test').Page, p: RegExp) => page.getByLabel(p).check()

test.describe('PDF Compressor (JPEG image recompression)', () => {
  test('page states what it does and does not do', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await expect(page.getByRole('heading', { level: 1, name: 'PDF Compressor' })).toBeVisible()
    await expect(page.getByText(/does not shrink text, vector graphics or fonts/)).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('PDF')
  })

  test('each preset recompresses the embedded JPEG; Strong is smaller than Light; output stays a valid PDF', async ({ page }) => {
    const sizes: Record<string, number> = {}
    for (const [label, re] of [['light', /Light/], ['strong', /Strong/]] as const) {
      await page.goto('/pdf-compressor')
      await upload(page, 'photo.pdf', await photoPdf())
      await preset(page, re); await compress(page)
      await expect(page.getByText('recompressed: 1')).toBeVisible()
      const out = await dl(page, /Download compressed PDF/)
      expect(out.filename).toBe('photo-compressed.pdf')
      expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(1)
      sizes[label] = out.bytes.length
    }
    expect(sizes.strong).toBeLessThan(sizes.light!)
  })

  test('the embedded image is still a decodable JPEG; Strong downsizes only when above the preset cap', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await upload(page, 'photo.pdf', await photoPdf())
    await preset(page, /Strong/); await compress(page)
    const [img] = await embeddedJpegs((await dl(page, /Download compressed PDF/)).bytes)
    expect(await decodeInBrowser(page, img!)).toMatchObject({ width: 400, height: 300 }) // 400px is under the 1400px cap
  })

  test('reports honest counts and savings from real measurements', async ({ page }) => {
    await page.goto('/pdf-compressor')
    const src = await photoPdf()
    await upload(page, 'photo.pdf', src)
    await compress(page)
    const status = page.getByRole('status').filter({ hasText: 'Images found: 1' })
    await expect(status).toContainText('left unchanged: 0')
    const out = await dl(page, /Download compressed PDF/)
    const pct = Number(/\(([\d.]+)% smaller\)/.exec(await status.innerText())![1])
    expect(pct).toBeCloseTo((1 - out.bytes.length / src.length) * 100, 0)
  })

  test('a text-only PDF: says nothing can be reduced and offers no download', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await upload(page, 'text.pdf', await textPdf(3))
    await compress(page)
    await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
    await expect(page.getByText('Images found: 0')).toBeVisible()
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
  })

  test('an already-small JPEG that cannot shrink is left unchanged, honestly', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await upload(page, 'tiny.pdf', await photoPdf('photo-q30.jpg'))
    await preset(page, /Light/); await compress(page)
    await expect(page.getByText(/recompressed: 0|No size reduction/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
  })

  test('changing the preset clears the previous result', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await upload(page, 'photo.pdf', await photoPdf())
    await compress(page)
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toBeVisible()
    await preset(page, /Strong/)
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
  })

  test('encrypted, signed, truncated and fake PDFs are refused with specific reasons', async ({ page }) => {
    await page.goto('/pdf-compressor')
    await upload(page, 'locked.pdf', await encryptedPdf())
    await expect(page.getByRole('alert')).toContainText('password-protected or encrypted')
    await upload(page, 'signed.pdf', await signedPdf())
    await expect(page.getByRole('alert')).toContainText('invalidate the signature')
    await upload(page, 'cut.pdf', (await photoPdf()).subarray(0, 80))
    await expect(page.getByRole('alert')).toContainText(/could not be read|damaged/)
    await upload(page, 'fake.pdf', Buffer.from('plain text'))
    await expect(page.getByRole('alert').filter({ hasText: 'fake.pdf' })).toContainText('not a supported file type')
  })

  test('cancel stops compression and the tool stays usable', async ({ page }) => {
    test.setTimeout(150_000)
    await page.goto('/pdf-compressor')
    await upload(page, 'many.pdf', await manyPhotosPdf(page, 24)) // long enough to still be running when we cancel
    await compress(page)
    await expect(page.getByRole('progressbar', { name: 'Recompressing images' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Compress PDF' })).toBeEnabled()
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0) // cancelling is not an error
    await compress(page) // and the tool works again
    await expect(page.getByText(/Images found: 24/)).toBeVisible({ timeout: 60_000 })
  })
})
