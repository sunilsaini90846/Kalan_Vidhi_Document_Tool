import { expect, test, type Page } from '@playwright/test'
import { addImages, decodeInBrowser, downloadRow, isJpeg, isPng, isWebp, row, uploadFixture, waitDone } from '../helpers'

const go = (page: Page, n = 1) => page.getByRole('button', { name: new RegExp(`^Resize ${n} image`) }).click()
const resized = async (page: Page, name: string) => decodeInBrowser(page, (await downloadRow(page, name)).bytes)

test.describe('Image Resizer', () => {
  test('page lists every accepted input format and requires a size before it can run', async ({ page }) => {
    await page.goto('/image-resizer')
    await expect(page.getByRole('heading', { level: 1, name: 'Image Resizer' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('JPG, PNG, WebP, GIF, BMP, TIFF, AVIF')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await expect(page.getByRole('button', { name: /^Resize 1 image/ })).toBeDisabled()
    await expect(page.getByText('Enter a width or height.')).toBeVisible()
    await page.getByLabel('Max width (px)').fill('200')
    await expect(page.getByRole('button', { name: /^Resize 1 image/ })).toBeEnabled()
  })

  test('width only, height only, and both (the tighter limit wins) keep the aspect ratio', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' }) // 400x300
    await page.getByLabel('Max width (px)').fill('200')
    await go(page); await waitDone(page, 'photo-q95.jpg')
    expect(await resized(page, 'photo-q95.jpg')).toMatchObject({ width: 200, height: 150 })

    await page.getByLabel('Max width (px)').fill('')
    await page.getByLabel('Max height (px)').fill('60')
    await row(page, 'photo-q95.jpg').getByRole('button', { name: /Remove/ }).click()
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await go(page); await waitDone(page, 'photo-q95.jpg')
    expect(await resized(page, 'photo-q95.jpg')).toMatchObject({ width: 80, height: 60 })

    await page.getByLabel('Max width (px)').fill('300')
    await row(page, 'photo-q95.jpg').getByRole('button', { name: /Remove/ }).click()
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await go(page); await waitDone(page, 'photo-q95.jpg')
    expect(await resized(page, 'photo-q95.jpg')).toMatchObject({ width: 80, height: 60 }) // 60px high is tighter than 300 wide
  })

  test('never enlarges by default; enlarges only when allowed', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Max width (px)').fill('800')
    await go(page); await waitDone(page, 'photo-q95.jpg')
    expect(await resized(page, 'photo-q95.jpg')).toMatchObject({ width: 400, height: 300 })
    await row(page, 'photo-q95.jpg').getByRole('button', { name: /Remove/ }).click()
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Allow enlarging small images').check()
    await go(page); await waitDone(page, 'photo-q95.jpg')
    expect(await resized(page, 'photo-q95.jpg')).toMatchObject({ width: 800, height: 600 })
  })

  test('keeps each format by default (JPEG stays JPEG, PNG stays PNG, WebP stays WebP)', async ({ page }) => {
    await page.goto('/image-resizer')
    await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 400, h: 300 }, { name: 'b.png', mime: 'image/png', w: 400, h: 300 }, { name: 'c.webp', mime: 'image/webp', w: 400, h: 300 }])
    await page.getByLabel('Max width (px)').fill('100')
    await go(page, 3)
    for (const n of ['a.jpg', 'b.png', 'c.webp']) await waitDone(page, n)
    expect(isJpeg((await downloadRow(page, 'a.jpg')).bytes)).toBe(true)
    expect(isPng((await downloadRow(page, 'b.png')).bytes)).toBe(true)
    expect(isWebp((await downloadRow(page, 'c.webp')).bytes)).toBe(true)
  })

  test('transparency survives resizing a PNG', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'alpha.png', { mime: 'image/png' })
    await page.getByLabel('Max width (px)').fill('200')
    await go(page); await waitDone(page, 'alpha.png')
    expect(await resized(page, 'alpha.png')).toMatchObject({ width: 200, height: 150, hasAlpha: true })
  })

  test('output format can be chosen explicitly', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await page.getByLabel(/Keep each image/).uncheck()
    await page.getByLabel('Output format').selectOption('image/jpeg')
    await page.getByLabel('Max width (px)').fill('200')
    await go(page); await waitDone(page, 'photo.png')
    const out = await downloadRow(page, 'photo.png')
    expect(out.filename).toBe('photo-resized.jpg')
    expect(isJpeg(out.bytes)).toBe(true)
  })

  test('EXIF-rotated photos resize from their upright shape', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'photo-exif6.jpg', { mime: 'image/jpeg' }) // displays 300x400
    await page.getByLabel('Max width (px)').fill('150')
    await go(page); await waitDone(page, 'photo-exif6.jpg')
    expect(await resized(page, 'photo-exif6.jpg')).toMatchObject({ width: 150, height: 200 })
  })

  test('corrupt images fail on their own row without stopping the others', async ({ page }) => {
    await page.goto('/image-resizer')
    await uploadFixture(page, 'truncated.jpg', { mime: 'image/jpeg' })
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await page.getByLabel('Max width (px)').fill('100')
    await go(page, 2)
    await expect(page.getByRole('status').filter({ hasText: 'succeeded' })).toHaveText('1 succeeded, 1 failed.')
    await expect(row(page, 'truncated.jpg')).toContainText('could not be decoded')
  })
})
