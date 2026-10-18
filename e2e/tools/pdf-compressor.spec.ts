import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { decodeInBrowser } from '../helpers'
import { fixtureBytes } from '../helpers'
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

  test('a PDF from another producer (reportlab: JPEG wrapped in ASCII85) is recompressed, text intact', async ({ page }) => {
    await page.goto('/pdf-compressor')
    const src = fixtureBytes('reportlab-jpeg.pdf') // genuine third-party file: Filter [/ASCII85Decode /DCTDecode]
    await upload(page, 'reportlab.pdf', src)
    await preset(page, /Strong/); await compress(page)
    await expect(page.getByText('recompressed: 1')).toBeVisible()
    const out = await dl(page, /Download compressed PDF/)
    expect(out.bytes.length).toBeLessThan(src.length * 0.3) // 95 KB of ASCII85 text becomes a small binary JPEG
    const doc = await PDFDocument.load(out.bytes)
    expect(doc.getPageCount()).toBe(1)
    const [img] = await embeddedJpegs(out.bytes)
    expect(await decodeInBrowser(page, img!)).toMatchObject({ width: 400, height: 300 })
    // the page's drawing/text instructions must be byte-for-byte what the producer wrote
    const content = async (b: Uint8Array) => {
      const d = await PDFDocument.load(b); const c = d.getPage(0).node.Contents()
      return Buffer.from((c as unknown as { contents: Uint8Array }).contents)
    }
    expect((await content(out.bytes)).equals(await content(src))).toBe(true)
  })

  test('images that cannot be recompressed are reported as no reduction: no "0.0% smaller", no download', async ({ page }) => {
    await page.goto('/pdf-compressor')
    const d = await PDFDocument.create()
    const png = await d.embedPng(fixtureBytes('photo.png')) // Flate-compressed pixels: not a JPEG
    d.addPage([595, 842]).drawImage(png, { x: 0, y: 0, width: 400, height: 300 })
    await upload(page, 'png-only.pdf', Buffer.from(await d.save()))
    await compress(page)
    await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
    await expect(page.getByText('Images were found, but none could be made smaller')).toBeVisible()
    await expect(page.getByText(/0\.0% smaller/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Download compressed PDF/ })).toHaveCount(0)
  })
})
