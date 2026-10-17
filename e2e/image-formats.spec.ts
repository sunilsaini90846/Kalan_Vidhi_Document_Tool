import { expect, test, type Page } from '@playwright/test'
import { decodeInBrowser, downloadRow, fixtureBytes, isJpeg, isPng, isWebp, row, uploadFixture, waitDone } from './helpers'

const convert = (page: Page, n = 1) => page.getByRole('button', { name: new RegExp(`^Convert ${n} image`) }).click()
const toPng = (page: Page) => page.getByLabel('Output format').selectOption('image/png')

async function convertToPng(page: Page, file: string, mime: string) {
  await page.goto('/image-converter')
  await uploadFixture(page, file, { mime })
  await toPng(page)
  await convert(page)
  await waitDone(page, file)
  return row(page, file)
}

test.describe('new input formats (genuine fixtures, output decoded back)', () => {
  test('static GIF converts to a real PNG', async ({ page }) => {
    await convertToPng(page, 'static.gif', 'image/gif')
    const out = await downloadRow(page, 'static.gif')
    expect(out.filename).toBe('static-converted.png')
    expect(isPng(out.bytes)).toBe(true)
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300 })
  })

  test('animated GIF is refused with an explanation; first-frame opt-in works and is disclosed', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'animated.gif', { mime: 'image/gif' })
    await toPng(page); await convert(page)
    await waitDone(page, 'animated.gif')
    await expect(row(page, 'animated.gif')).toContainText('animated GIF')
    await expect(row(page, 'animated.gif')).toContainText('lose the animation')
    await page.getByLabel(/Use only the first frame/).check()
    await row(page, 'animated.gif').getByRole('button', { name: 'Retry' }).click()
    await waitDone(page, 'animated.gif')
    await expect(row(page, 'animated.gif')).toContainText('only the first frame was used')
    const out = await downloadRow(page, 'animated.gif')
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 64, height: 48 })
  })

  test('APNG and animated WebP follow the same animation policy in the converter', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'animated.png', { mime: 'image/png' })
    await uploadFixture(page, 'animated.webp', { mime: 'image/webp' })
    await convert(page, 2)
    await waitDone(page, 'animated.png'); await waitDone(page, 'animated.webp')
    await expect(row(page, 'animated.png')).toContainText('APNG')
    await expect(row(page, 'animated.webp')).toContainText('animated WebP')
  })

  test('BMP converts to PNG and to JPG with the right sizes and formats', async ({ page }) => {
    await convertToPng(page, 'photo.bmp', 'image/bmp')
    const png = await downloadRow(page, 'photo.bmp')
    expect(isPng(png.bytes)).toBe(true)
    expect(await decodeInBrowser(page, png.bytes)).toMatchObject({ width: 40, height: 30 })
    await page.getByLabel('Output format').selectOption('image/jpeg')
    await row(page, 'photo.bmp').getByRole('button', { name: 'Remove photo.bmp' }).click()
    await uploadFixture(page, 'photo.bmp', { mime: 'image/bmp' })
    await convert(page)
    await waitDone(page, 'photo.bmp')
    const jpg = await downloadRow(page, 'photo.bmp')
    expect(isJpeg(jpg.bytes)).toBe(true)
    expect(jpg.filename).toBe('photo-converted.jpg')
    await expect(row(page, 'photo.bmp')).toContainText('lossless BMP to lossy JPEG')
  })

  test('TIFF converts to PNG, and its decoder is downloaded only when a TIFF is used', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (r) => { if (/UTIF/i.test(r.url())) requested.push(r.url()) })
    // 1) a JPEG never pulls in the TIFF decoder
    await page.goto('/image-converter')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await toPng(page); await convert(page)
    await waitDone(page, 'photo-q95.jpg')
    expect(requested).toEqual([])
    // 2) a TIFF does, and converts correctly
    await row(page, 'photo-q95.jpg').getByRole('button', { name: /Remove/ }).click()
    await uploadFixture(page, 'photo.tiff', { mime: 'image/tiff' })
    await convert(page)
    await waitDone(page, 'photo.tiff')
    const out = await downloadRow(page, 'photo.tiff')
    expect(isPng(out.bytes)).toBe(true)
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300 })
    expect(requested.length).toBeGreaterThan(0)
  })

  test('AVIF converts where the browser can decode it, and explains clearly where it cannot', async ({ page }) => {
    await page.goto('/image-converter')
    const decodes = await page.evaluate(async (b64) => { try { (await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/avif' }))).close(); return true } catch { return false } }, fixtureBytes('photo.avif').toString('base64'))
    await uploadFixture(page, 'photo.avif', { mime: 'image/avif' })
    await toPng(page); await convert(page)
    await waitDone(page, 'photo.avif')
    if (decodes) {
      const out = await downloadRow(page, 'photo.avif')
      expect(isPng(out.bytes)).toBe(true)
      expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 400, height: 300 })
    } else {
      await expect(row(page, 'photo.avif')).toContainText('Your browser may not support AVIF')
    }
  })

  test('ICO converts to PNG', async ({ page }) => {
    await convertToPng(page, 'icon.ico', 'image/x-icon')
    const out = await downloadRow(page, 'icon.ico')
    expect(isPng(out.bytes)).toBe(true)
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 32, height: 32 })
  })

  test('SVG is rasterized: natural size in the converter, requested size in the resizer', async ({ page }) => {
    await convertToPng(page, 'logo.svg', 'image/svg+xml')
    await expect(row(page, 'logo.svg')).toContainText('SVG was rasterized')
    const natural = await downloadRow(page, 'logo.svg')
    expect(isPng(natural.bytes)).toBe(true)
    expect(await decodeInBrowser(page, natural.bytes)).toMatchObject({ width: 200, height: 100 })

    await page.goto('/image-resizer')
    await uploadFixture(page, 'logo.svg', { mime: 'image/svg+xml' })
    await page.getByLabel('Max width (px)').fill('600')
    await page.getByRole('button', { name: /^Resize 1 image/ }).click()
    await waitDone(page, 'logo.svg')
    const big = await downloadRow(page, 'logo.svg')
    expect(await decodeInBrowser(page, big.bytes)).toMatchObject({ width: 600, height: 300 }) // vector scaled up crisply
  })

  test('a malicious SVG is rejected before it is rendered', async ({ page }) => {
    await page.goto('/image-converter')
    const alerts: string[] = []
    page.on('dialog', (d) => { alerts.push(d.message()); void d.dismiss() })
    await uploadFixture(page, 'malicious.svg', { mime: 'image/svg+xml' })
    await convert(page)
    await waitDone(page, 'malicious.svg')
    await expect(row(page, 'malicious.svg')).toContainText('<script>')
    await expect(row(page, 'malicious.svg').getByRole('button', { name: 'Download' })).toHaveCount(0)
    expect(alerts).toEqual([])
  })

  test('PNG to JPG: lossy and transparency notes are shown per file', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'alpha.png', { mime: 'image/png' })
    await page.getByLabel('Output format').selectOption('image/jpeg')
    await convert(page)
    await waitDone(page, 'alpha.png')
    await expect(row(page, 'alpha.png')).toContainText('transparent areas were filled with white')
    await expect(row(page, 'alpha.png')).toContainText('lossless PNG to lossy JPEG')
    const out = await downloadRow(page, 'alpha.png')
    expect(isJpeg(out.bytes)).toBe(true)
    expect((await decodeInBrowser(page, out.bytes)).hasAlpha).toBe(false)
  })

  test('PNG to WebP keeps transparency', async ({ page }) => {
    await page.goto('/image-converter')
    await uploadFixture(page, 'alpha.png', { mime: 'image/png' })
    await convert(page)
    await waitDone(page, 'alpha.png')
    const out = await downloadRow(page, 'alpha.png')
    expect(isWebp(out.bytes)).toBe(true)
    expect((await decodeInBrowser(page, out.bytes)).hasAlpha).toBe(true)
  })

  test('a tiny image converted to JPG shows the real size increase, not a saving', async ({ page }) => {
    await convertToPng(page, 'tiny-1x1.png', 'image/png') // sanity: works
    await page.getByLabel('Output format').selectOption('image/jpeg')
    await row(page, 'tiny-1x1.png').getByRole('button', { name: /Remove/ }).click()
    await uploadFixture(page, 'tiny-1x1.png', { mime: 'image/png' })
    await convert(page)
    await waitDone(page, 'tiny-1x1.png')
    await expect(row(page, 'tiny-1x1.png')).toContainText(/\d+(\.\d)?% larger than the original/)
    await expect(row(page, 'tiny-1x1.png')).not.toContainText(/\d% smaller/)
  })

  test('resizer saves GIF as PNG by default and never enlarges', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'static.gif', { mime: 'image/gif' })
    await page.getByLabel('Max width (px)').fill('200')
    await page.getByRole('button', { name: /^Resize 1 image/ }).click()
    await waitDone(page, 'static.gif')
    const out = await downloadRow(page, 'static.gif')
    expect(isPng(out.bytes)).toBe(true)
    expect(out.filename).toBe('static-resized.png')
    await expect(row(page, 'static.gif')).toContainText('cannot be written back as GIF')
    expect(await decodeInBrowser(page, out.bytes)).toMatchObject({ width: 200, height: 150 })
  })
})

test.describe('formats we do not support say so clearly', () => {
  const heic = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0, 0, 0, 0])
  const mp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 0, 0, 0, 0])
  const sevenZ = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4, 1, 2, 3, 4, 5, 6, 7, 8])
  const rtf = Buffer.from('{\\rtf1\\ansi hello}')

  for (const [name, bytes, expected] of [['photo.heic', heic, /HEIC.*not supported yet/s], ['clip.mp4', mp4, /MP4.*not supported/s], ['archive.7z', sevenZ, /7Z.*not supported yet/s], ['letter.rtf', rtf, /RTF.*not supported/s]] as const) {
    test(`${name} is rejected on the homepage with a specific reason`, async ({ page }) => {
      await page.goto('/')
      await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes })
      await expect(page.getByRole('alert')).toContainText(expected)
      await expect(page).toHaveURL(/\/$/)
    })
  }

  test('HEIC on the image compressor names the format and a workaround', async ({ page }) => {
    await page.goto('/image-compressor')
    await page.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic })
    await expect(page.getByRole('alert')).toContainText('HEIC / HEIF file')
    await expect(page.getByRole('alert')).toContainText('JPEG')
  })

  test('every tool shows its accepted formats and the size limit before any file is chosen', async ({ page }) => {
    for (const [path, expected] of [['/image-compressor', 'JPG, PNG, WebP'], ['/image-converter', 'GIF'], ['/image-to-pdf', 'GIF, BMP'], ['/merge-pdf', 'PDF'], ['/docx-optimizer', 'DOCX'], ['/odf-optimizer', 'ODT, ODS, ODP'], ['/epub-optimizer', 'EPUB'], ['/zip-tools', 'TAR']] as const) {
      await page.goto(path)
      await expect(page.getByText(/Accepted:/).first()).toContainText(expected)
      await expect(page.getByText(/Up to 100 MB per file/).first()).toBeVisible()
    }
  })
})
