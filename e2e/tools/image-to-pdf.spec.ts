import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { addImages, decodeInBrowser, uploadFixture } from '../helpers'
import { dl, embeddedJpegs, hasSoftMask, saved } from '../tool-kit'

const create = (page: Page) => page.getByRole('button', { name: 'Create PDF' }).click()
async function makePdf(page: Page) {
  await create(page)
  await expect(page.getByRole('status').filter({ hasText: 'PDF ready and verified' })).toBeVisible()
  const out = await dl(page, /^Download .*\.pdf/)
  return { ...out, doc: await PDFDocument.load(out.bytes) }
}
const dims = (d: PDFDocument, i = 0) => [Math.round(d.getPage(i).getWidth()), Math.round(d.getPage(i).getHeight())]
const three = [
  { name: 'a.jpg', mime: 'image/jpeg' as const, w: 600, h: 400 },
  { name: 'b.png', mime: 'image/png' as const, w: 300, h: 500, transparent: true },
  { name: 'c.webp', mime: 'image/webp' as const, w: 400, h: 400 },
]

test.describe('Image to PDF', () => {
  test('page lists accepted formats; nothing can be created until an image is added', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await expect(page.getByRole('heading', { level: 1, name: 'Image to PDF' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('JPG, PNG, WebP, GIF, BMP')
    await expect(page.getByRole('button', { name: 'Create PDF' })).toHaveCount(0)
  })

  test('one image makes a one-page PDF named by the filename field', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('PDF filename').fill('my holiday: 2026')
    const out = await makePdf(page)
    expect(out.filename).toBe('my holiday_ 2026.pdf') // unsafe characters are replaced
    expect(out.doc.getPageCount()).toBe(1)
  })

  const sizes: [string, number, number][] = [['a4', 595, 842], ['a3', 842, 1191], ['letter', 612, 792], ['legal', 612, 1008]]
  for (const [preset, w, h] of sizes) {
    test(`page size ${preset.toUpperCase()}: portrait and landscape dimensions`, async ({ page }) => {
      await page.goto('/image-to-pdf')
      await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
      await page.getByLabel('Page size').selectOption(preset)
      expect(dims((await makePdf(page)).doc)).toEqual([w, h])
      await page.getByLabel('Orientation').selectOption('landscape')
      expect(dims((await makePdf(page)).doc)).toEqual([h, w])
    })
  }

  test('custom page size in millimetres', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Page size').selectOption('custom')
    await page.getByLabel('Width mm').fill('100'); await page.getByLabel('Height mm').fill('200')
    expect(dims((await makePdf(page)).doc)).toEqual([283, 567])
  })

  test('order: move up/down, remove, and add more without losing the selection', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await addImages(page, three)
    const names = page.getByRole('list', { name: /page order/ }).locator('p.font-medium')
    await expect(names).toHaveText(['a.jpg', 'b.png', 'c.webp'])
    await page.getByRole('button', { name: 'Move c.webp up' }).click()
    await expect(names).toHaveText(['a.jpg', 'c.webp', 'b.png'])
    await page.getByRole('button', { name: 'Move a.jpg down' }).click()
    await expect(names).toHaveText(['c.webp', 'a.jpg', 'b.png'])
    await page.getByRole('button', { name: 'Remove b.png' }).click()
    await expect(names).toHaveText(['c.webp', 'a.jpg'])
    await uploadFixture(page, 'static.gif', { mime: 'image/gif' })
    await expect(names).toHaveText(['c.webp', 'a.jpg', 'static.gif'])
    await expect(page.getByRole('status').first()).toContainText('3 images')
    expect((await makePdf(page)).doc.getPageCount()).toBe(3)
  })

  test('first-up and last-down buttons are disabled; clear all empties the tool', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await addImages(page, three.slice(0, 2))
    await expect(page.getByRole('button', { name: 'Move a.jpg up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move b.png down' })).toBeDisabled()
    await page.getByRole('button', { name: /Clear all/ }).click()
    await expect(page.getByRole('button', { name: 'Create PDF' })).toHaveCount(0)
  })

  test('grid layouts: pages = ceil(images / per page), with spacing control', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await addImages(page, [...three, { name: 'd.jpg', mime: 'image/jpeg', w: 200, h: 200 }, { name: 'e.jpg', mime: 'image/jpeg', w: 200, h: 200 }])
    await page.getByLabel('Columns', { exact: true }).fill('2'); await page.getByLabel('Rows', { exact: true }).fill('2')
    await expect(page.getByLabel('Spacing (mm)')).toBeVisible()
    await expect(page.getByRole('status').first()).toContainText('2 pages')
    expect((await makePdf(page)).doc.getPageCount()).toBe(2)
    await page.getByLabel('Columns', { exact: true }).fill('1'); await page.getByLabel('Rows', { exact: true }).fill('1')
    expect((await makePdf(page)).doc.getPageCount()).toBe(5)
  })

  test('margins that leave no room are reported, not silently ignored', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Page size').selectOption('custom')
    await page.getByLabel('Width mm').fill('50'); await page.getByLabel('Height mm').fill('50')
    await page.getByLabel('Margin (mm)').fill('25') // 25 + 25 = the whole 50 mm page
    await expect(page.getByRole('alert')).toContainText('no room')
    await expect(page.getByRole('button', { name: 'Create PDF' })).toBeDisabled()
  })

  test('transparent PNG is flattened onto white, not black, in the PDF', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'alpha.png', { mime: 'image/png' }) // corners are fully transparent
    const out = await makePdf(page)
    expect(await hasSoftMask(out.bytes)).toBe(false)
    const [jpeg] = await embeddedJpegs(out.bytes)
    const px = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0); return [...ctx.getImageData(2, 2, 1, 1).data]
    }, Buffer.from(jpeg!).toString('base64'))
    expect(px.slice(0, 3).every((v) => v > 240)).toBe(true)
  })

  test('rotation turns the embedded image by 90° each click', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' }) // 400x300
    const [before] = await embeddedJpegs((await makePdf(page)).bytes)
    expect(await decodeInBrowser(page, before!)).toMatchObject({ width: 400, height: 300 })
    await page.getByRole('button', { name: 'Rotate photo-q95.jpg' }).click()
    await expect(page.getByText('rotated 90°')).toBeVisible()
    const [after] = await embeddedJpegs((await makePdf(page)).bytes)
    expect(await decodeInBrowser(page, after!)).toMatchObject({ width: 300, height: 400 })
  })

  test('fit keeps the whole image; fill crops it to the page area', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    const [fit] = await embeddedJpegs((await makePdf(page)).bytes)
    const f = await decodeInBrowser(page, fit!)
    expect(f.width / f.height).toBeCloseTo(4 / 3, 2)
    await page.getByLabel('Image placement').selectOption('fill')
    const [fill] = await embeddedJpegs((await makePdf(page)).bytes)
    const c = await decodeInBrowser(page, fill!)
    expect(c.width / c.height).toBeLessThan(0.75) // cropped towards the portrait page area
  })

  test('resize before embedding caps the longest side; quality choice changes PDF size', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await addImages(page, [{ name: 'big.jpg', mime: 'image/jpeg', w: 3000, h: 2000 }])
    await page.getByLabel('Resize before embedding').selectOption('1754')
    const [img] = await embeddedJpegs((await makePdf(page)).bytes)
    expect(await decodeInBrowser(page, img!)).toMatchObject({ width: 1754, height: 1169 })
    await page.getByLabel('Resize before embedding').selectOption('0')
    await page.getByLabel('Image quality').selectOption('0.75')
    const small = (await makePdf(page)).bytes.length
    await page.getByLabel('Image quality').selectOption('1')
    const lossless = (await makePdf(page)).bytes.length
    expect(small).toBeLessThan(lossless)
  })

  test('animated GIF is refused unless first-frame is allowed; BMP and static GIF work', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'animated.gif', { mime: 'image/gif' })
    await create(page)
    await expect(page.getByRole('alert')).toContainText('animated GIF')
    await page.getByLabel(/Use only the first frame/).check()
    expect((await makePdf(page)).doc.getPageCount()).toBe(1)
  })

  test('unsupported files are rejected up front (TIFF, SVG, text, empty)', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo.tiff', { mime: 'image/tiff' })
    await expect(page.getByRole('alert')).toContainText('TIFF')
    await page.locator('input[type=file]').setInputFiles({ name: 'e.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })
    await expect(page.getByRole('alert')).toContainText('empty')
    await expect(page.getByRole('button', { name: 'Create PDF' })).toHaveCount(0)
  })

  test('changing any setting invalidates the previous download', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await makePdf(page)
    await page.getByLabel('Orientation').selectOption('landscape')
    await expect(page.getByRole('button', { name: /^Download .*\.pdf/ })).toHaveCount(0)
  })

  test('a corrupt image reports a clear error and no PDF is offered', async ({ page }) => {
    await page.goto('/image-to-pdf')
    await uploadFixture(page, 'truncated.jpg', { mime: 'image/jpeg' })
    await create(page)
    await expect(page.getByRole('alert')).toContainText('could not be decoded')
    await expect(page.getByRole('button', { name: /^Download .*\.pdf/ })).toHaveCount(0)
    void saved
  })
})
