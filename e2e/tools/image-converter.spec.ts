import { expect, test, type Page } from '@playwright/test'
import { decodeInBrowser, downloadRow, isJpeg, isPng, isWebp, row, uploadFixture, waitDone } from '../helpers'

const convert = (page: Page, n = 1) => page.getByRole('button', { name: new RegExp(`^Convert ${n} image`) }).click()
const to = (page: Page, mime: string) => page.getByLabel('Output format').selectOption(mime)

test.describe('Image Converter', () => {
  test('page lists accepted formats and the output choices with their trade-offs', async ({ page }) => {
    await page.goto('/image-converter')
    await expect(page.getByRole('heading', { level: 1, name: 'Image Converter' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('SVG')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    const options = await page.getByLabel('Output format').locator('option').allTextContents()
    expect(options.join('|')).toMatch(/JPG.*PNG.*WebP/)
    expect(options.find((o) => o.startsWith('PNG'))).toMatch(/lossless/)
  })

  const matrix: [string, string, string, (b: Uint8Array) => boolean, string][] = [
    ['photo-q95.jpg', 'image/jpeg', 'image/png', isPng, 'photo-q95-converted.png'],
    ['photo.png', 'image/png', 'image/jpeg', isJpeg, 'photo-converted.jpg'],
    ['photo.png', 'image/png', 'image/webp', isWebp, 'photo-converted.webp'],
    ['photo.webp', 'image/webp', 'image/png', isPng, 'photo-converted.png'],
    ['photo.webp', 'image/webp', 'image/jpeg', isJpeg, 'photo-converted.jpg'],
    ['photo-q95.jpg', 'image/jpeg', 'image/webp', isWebp, 'photo-q95-converted.webp'],
  ]
  for (const [file, inMime, outMime, check, outName] of matrix) {
    test(`${file} → ${outMime.replace('image/', '').toUpperCase()}: real file, right name, same dimensions`, async ({ page }) => {
      await page.goto('/image-converter')
      await uploadFixture(page, file, { mime: inMime })
      await to(page, outMime); await convert(page); await waitDone(page, file)
      const out = await downloadRow(page, file)
      expect(out.filename).toBe(outName)
      expect(check(out.bytes)).toBe(true)
      expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300 })
    })
  }

  test('transparency: kept for PNG and WebP, flattened to white (with a note) for JPG', async ({ page }) => {
    for (const [mime, alpha] of [['image/png', true], ['image/webp', true], ['image/jpeg', false]] as const) {
      await page.goto('/image-converter')
      await uploadFixture(page, 'alpha.png', { mime: 'image/png' })
      await to(page, mime); await convert(page); await waitDone(page, 'alpha.png')
      expect((await decodeInBrowser(page, (await downloadRow(page, 'alpha.png')).bytes)).hasAlpha, mime).toBe(alpha)
      if (!alpha) await expect(row(page, 'alpha.png')).toContainText('filled with white')
    }
  })

  test('quality slider shows only for lossy output and changes the JPG size', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await to(page, 'image/png')
    await expect(page.getByLabel('Quality')).toHaveCount(0)
    await to(page, 'image/jpeg')
    await expect(page.getByLabel('Quality')).toBeVisible()
    const sizes: number[] = []
    for (const q of ['0.9', '0.3']) {
      await page.getByLabel('Quality').fill(q)
      await convert(page); await waitDone(page, 'photo.png')
      sizes.push((await downloadRow(page, 'photo.png')).bytes.length)
      await row(page, 'photo.png').getByRole('button', { name: /Remove/ }).click()
      await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    }
    expect(sizes[1]).toBeLessThan(sizes[0]!)
  })

  test('batch of mixed formats converts each one and offers a ZIP', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'static.gif', { mime: 'image/gif' })
    await uploadFixture(page, 'photo.bmp', { mime: 'image/bmp' })
    await uploadFixture(page, 'photo.tiff', { mime: 'image/tiff' })
    await to(page, 'image/png'); await convert(page, 3)
    for (const n of ['static.gif', 'photo.bmp', 'photo.tiff']) await waitDone(page, n)
    await expect(page.getByRole('status').filter({ hasText: 'succeeded' })).toHaveText('3 succeeded.')
    const p = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download all/ }).click()
    expect((await p).suggestedFilename()).toBe('convert-images.zip')
  })

  test('unsupported and invalid inputs are rejected with reasons', async ({ page }) => {
    await page.goto('/image-converter')
    await page.locator('input[type=file]').setInputFiles({ name: 'x.heic', mimeType: 'image/heic', buffer: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]) })
    await expect(page.getByRole('alert')).toContainText('HEIC')
    await page.locator('input[type=file]').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') })
    await expect(page.getByRole('alert')).toContainText('PDF')
  })
})
