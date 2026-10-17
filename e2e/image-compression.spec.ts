import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { decodeInBrowser, downloadRow, fixtureBytes, isJpeg, isPng, isWebp, magic, maxPixelDiff, row, sizeFromRow, uploadFixture, waitDone } from './helpers'

const compress = (page: import('@playwright/test').Page, n = 1) => page.getByRole('button', { name: new RegExp(`^Compress ${n} image`) }).click()
const preset = (page: import('@playwright/test').Page, name: string) => page.getByRole('button', { name, exact: true }).click()

test.describe('image compressor correctness (regressions for the format/animation bugs)', () => {
  test('JPEG to JPEG: smaller, real JPEG, upright dimensions, original untouched', async ({ page }) => {
    await page.goto('/image-compressor')
    const src = fixtureBytes('photo-q95.jpg')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await compress(page)
    await waitDone(page, 'photo-q95.jpg')
    await expect(row(page, 'photo-q95.jpg')).toContainText(/\d+(\.\d)?% smaller/)
    await expect(row(page, 'photo-q95.jpg')).toContainText('JPEG quality 75%')
    const out = await downloadRow(page, 'photo-q95.jpg')
    expect(out.filename).toBe('photo-q95-compressed.jpg')
    expect(isJpeg(out.bytes)).toBe(true)
    expect(out.bytes.length).toBeLessThan(src.length)
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300 })
    expect(fixtureBytes('photo-q95.jpg').equals(src)).toBe(true) // the original file on disk is unchanged
  })

  test('PNG High Quality is lossless: pixel-identical, valid PNG', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await preset(page, 'High Quality')
    await compress(page)
    await waitDone(page, 'photo.png')
    await expect(row(page, 'photo.png')).toContainText('PNG, lossless')
    const out = await downloadRow(page, 'photo.png')
    expect(isPng(out.bytes)).toBe(true)
    expect(out.filename).toBe('photo-compressed.png')
    expect(await maxPixelDiff(page, fixtureBytes('photo.png'), out.bytes)).toBe(0)
  })

  test('PNG lossy presets actually reduce size and say so', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await preset(page, 'Low Size')
    await compress(page)
    await waitDone(page, 'photo.png')
    await expect(row(page, 'photo.png')).toContainText('PNG reduced to')
    await expect(row(page, 'photo.png')).toContainText('(lossy)')
    expect(await sizeFromRow(page, 'photo.png')).toBeLessThan(fixtureBytes('photo.png').length * 0.6)
  })

  test('PNG quality setting changes the output (it used to be ignored)', async ({ page }) => {
    const sizes: number[] = []
    for (const q of ['0.95', '0.5']) {
      await page.goto('/image-compressor')
      await uploadFixture(page, 'photo.png', { mime: 'image/png' })
      await page.getByLabel('Quality').fill(q)
      await compress(page)
      await waitDone(page, 'photo.png')
      sizes.push(await sizeFromRow(page, 'photo.png'))
    }
    expect(sizes[1]).toBeLessThan(sizes[0]!)
  })

  for (const [label, as, mime] of [['correct name and type', 'alpha.png', 'image/png'], ['no usable MIME type', 'alpha.png', 'application/octet-stream'], ['misnamed .jpg with image/jpeg', 'alpha.jpg', 'image/jpeg'], ['no extension', 'alpha', '']] as const) {
    test(`PNG with transparency stays PNG and keeps its alpha (${label})`, async ({ page }) => {
      await page.goto('/image-compressor')
      await uploadFixture(page, 'alpha.png', { as, mime: mime || 'application/octet-stream' })
      await compress(page)
      await waitDone(page, as)
      const out = await downloadRow(page, as)
      expect(isPng(out.bytes), 'must still be a PNG, never silently JPEG').toBe(true)
      expect(out.filename.endsWith('.png')).toBe(true)
      expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300, hasAlpha: true })
      expect(out.bytes.length).toBeLessThan(fixtureBytes('alpha.png').length)
    })
  }

  test('WebP to WebP: smaller real WebP, alpha preserved', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo.webp', { mime: 'image/webp' })
    await uploadFixture(page, 'alpha.webp', { mime: 'image/webp' })
    await compress(page, 2)
    await waitDone(page, 'photo.webp'); await waitDone(page, 'alpha.webp')
    const photo = await downloadRow(page, 'photo.webp')
    expect(isWebp(photo.bytes)).toBe(true)
    expect(photo.bytes.length).toBeLessThan(fixtureBytes('photo.webp').length)
    const alpha = await downloadRow(page, 'alpha.webp')
    expect(isWebp(alpha.bytes)).toBe(true)
    expect((await decodeInBrowser(page, alpha.bytes)).hasAlpha).toBe(true)
  })

  test('already-compressed JPEG: honest "kept original", 0% saved, identical download', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-q30.jpg', { mime: 'image/jpeg' })
    await compress(page)
    await waitDone(page, 'photo-q30.jpg')
    await expect(row(page, 'photo-q30.jpg')).toContainText('original is kept (0% saved)')
    await expect(row(page, 'photo-q30.jpg')).not.toContainText(/\d% smaller/)
    const out = await downloadRow(page, 'photo-q30.jpg')
    expect(out.filename).toBe('photo-q30.jpg')
    expect(out.bytes.equals(fixtureBytes('photo-q30.jpg'))).toBe(true)
  })

  test('custom quality changes the JPEG output size', async ({ page }) => {
    const sizes: number[] = []
    for (const q of ['0.9', '0.4']) {
      await page.goto('/image-compressor')
      await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
      await page.getByLabel('Quality').fill(q)
      await compress(page)
      await waitDone(page, 'photo-q95.jpg')
      sizes.push(await sizeFromRow(page, 'photo-q95.jpg'))
    }
    expect(sizes[1]).toBeLessThan(sizes[0]!)
  })

  test('quality ladder is bounded and reports the quality actually used', async ({ page }) => {
    await page.goto('/image-compressor')
    // a q75-ish JPEG: first try at 75% is not smaller, so a lower quality must be used and reported
    await uploadFixture(page, 'photo-exif6.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Quality').fill('0.9')
    await compress(page)
    await waitDone(page, 'photo-exif6.jpg')
    const text = await row(page, 'photo-exif6.jpg').innerText()
    expect(text).toMatch(/JPEG quality \d+%/)
    const used = Number(/JPEG quality (\d+)%/.exec(text)![1])
    expect(used).toBeGreaterThanOrEqual(70) // 90 -> at most two steps down (70)
  })

  test('EXIF orientation is applied once: upright output, correct size', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-exif6.jpg', { mime: 'image/jpeg' })
    await compress(page)
    await waitDone(page, 'photo-exif6.jpg')
    const out = await downloadRow(page, 'photo-exif6.jpg')
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 300, height: 400 }) // stored 400x300, orientation 6
    await expect(row(page, 'photo-exif6.jpg')).toContainText('300×400')
  })

  test('opt-in resize keeps aspect ratio and never enlarges', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await uploadFixture(page, 'tiny-1x1.png', { mime: 'image/png' })
    await page.getByLabel(/Also resize/).check()
    await page.getByLabel('Max width (px)').fill('200')
    await compress(page, 2)
    await waitDone(page, 'photo-q95.jpg'); await waitDone(page, 'tiny-1x1.png')
    await expect(row(page, 'photo-q95.jpg')).toContainText('200×150')
    await expect(row(page, 'tiny-1x1.png')).toContainText('1×1')
  })

  test('very small image does not crash and yields a valid, honest result', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'tiny-1x1.png', { mime: 'image/png' })
    await compress(page)
    await waitDone(page, 'tiny-1x1.png')
    const out = await downloadRow(page, 'tiny-1x1.png')
    expect(isPng(out.bytes)).toBe(true)
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 1, height: 1 })
  })

  test('a large image within the limit (24 megapixels) compresses', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/image-compressor')
    const bytes = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 6000; c.height = 4000
      const ctx = c.getContext('2d')!; const g = ctx.createLinearGradient(0, 0, 6000, 4000); g.addColorStop(0, '#e33'); g.addColorStop(1, '#33e'); ctx.fillStyle = g; ctx.fillRect(0, 0, 6000, 4000)
      for (let i = 0; i < 3000; i++) { ctx.fillStyle = `hsl(${i * 7 % 360} 70% 50%)`; ctx.fillRect(i * 31 % 6000, i * 17 % 4000, 90, 90) }
      const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/jpeg', 1))
      return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]!); r.readAsDataURL(b) })
    })
    await page.locator('input[type=file]').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes, 'base64') })
    await compress(page)
    await expect(row(page, 'big.jpg')).toContainText(/smaller|well optimized/, { timeout: 90_000 })
    await expect(row(page, 'big.jpg')).toContainText('6000×4000')
  })

  test('images over the pixel limit are refused before decoding, with a clear message', async ({ page }) => {
    await page.goto('/image-compressor')
    // valid PNG signature + IHDR claiming 20000x20000 (400 MP); no pixel data needed because we read the header first
    const ihdr = Buffer.alloc(25); ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4); ihdr.writeUInt32BE(20000, 8); ihdr.writeUInt32BE(20000, 12); ihdr[16] = 8; ihdr[17] = 2
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(40)])
    await page.locator('input[type=file]').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: png })
    await compress(page)
    await waitDone(page, 'huge.png')
    await expect(row(page, 'huge.png')).toContainText('400.0 megapixels')
    await expect(row(page, 'huge.png')).toContainText('limit is 50.0 megapixels')
  })

  test('animated WebP, APNG and GIF are refused, never silently flattened', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'animated.webp', { mime: 'image/webp' })
    await uploadFixture(page, 'animated.png', { mime: 'image/png' })
    await compress(page, 2)
    await waitDone(page, 'animated.webp'); await waitDone(page, 'animated.png')
    await expect(row(page, 'animated.webp')).toContainText('animated WebP')
    await expect(row(page, 'animated.webp')).toContainText('lose the animation')
    await expect(row(page, 'animated.png')).toContainText('APNG')
    await expect(row(page, 'animated.webp').getByRole('button', { name: 'Download' })).toHaveCount(0)
  })

  test('animated images can be processed as first frame only, with a visible note', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'animated.webp', { mime: 'image/webp' })
    await page.getByLabel(/Use only the first frame/).check()
    await compress(page)
    await waitDone(page, 'animated.webp')
    await expect(row(page, 'animated.webp')).toContainText('only the first frame was used')
  })

  test('GIF and BMP are not accepted by the compressor, and the message says where to go', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'static.gif', { mime: 'image/gif' })
    await expect(page.getByRole('alert')).toContainText('GIF')
    await expect(page.getByRole('alert')).toContainText('Image Converter')
    await uploadFixture(page, 'photo.bmp', { mime: 'image/bmp' })
    await expect(page.getByRole('alert')).toContainText('BMP')
  })

  test('invalid inputs: renamed text file, empty file, extension/content mismatch', async ({ page }) => {
    await page.goto('/image-compressor')
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a jpeg at all') })
    await expect(page.getByRole('alert')).toContainText('not a supported file type')
    await page.locator('input[type=file]').setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })
    await expect(page.getByRole('alert')).toContainText('empty')
    // a real PDF with a .png name is identified by content, and rejected as a PDF
    await page.locator('input[type=file]').setInputFiles({ name: 'doc.png', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.4\n%....') })
    await expect(page.getByRole('alert')).toContainText('PDF')
  })

  test('corrupt and truncated images fail individually; the batch continues and Retry is offered', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'truncated.jpg', { mime: 'image/jpeg' })
    await uploadFixture(page, 'corrupt.png', { mime: 'image/png' })
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await compress(page, 3)
    await expect(page.getByRole('status').filter({ hasText: 'succeeded' })).toHaveText('1 succeeded, 2 failed.', { timeout: 30_000 })
    await expect(row(page, 'truncated.jpg')).toContainText('could not be decoded')
    await expect(row(page, 'corrupt.png')).toContainText('could not be decoded')
    await expect(row(page, 'photo-q95.jpg').getByRole('button', { name: 'Download' })).toBeVisible()
    await expect(row(page, 'truncated.jpg').getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  test('PDF made from images downloads as a valid PDF (GIF and BMP accepted)', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'static.gif', { mime: 'image/gif' })
    await uploadFixture(page, 'photo.bmp', { mime: 'image/bmp' })
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByRole('button', { name: 'Create PDF' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'PDF ready and verified' })).toBeVisible()
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Download .*\.pdf/ }).click()
    const { readFileSync } = await import('node:fs')
    expect((await PDFDocument.load(readFileSync(await (await dl).path()))).getPageCount()).toBe(3)
  })

  test('ZIP of several results contains only valid files with the right extensions', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await uploadFixture(page, 'alpha.png', { mime: 'image/png' })
    await compress(page, 2)
    await waitDone(page, 'photo-q95.jpg'); await waitDone(page, 'alpha.png')
    const p = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download all/ }).click()
    const { readFileSync } = await import('node:fs')
    const { unzipSync } = await import('fflate')
    const files = unzipSync(new Uint8Array(readFileSync(await (await p).path())))
    expect(Object.keys(files).sort()).toEqual(['alpha-compressed.png', 'photo-q95-compressed.jpg'])
    expect(isPng(files['alpha-compressed.png']!)).toBe(true)
    expect(isJpeg(files['photo-q95-compressed.jpg']!)).toBe(true)
    void magic
  })
})
