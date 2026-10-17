import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { addImages, addRawFile } from './helpers'

test('compressor shrinks a real image and offers a valid download', async ({ page }) => {
  await page.goto('/image-compressor')
  await addImages(page, [{ name: 'photo.jpg', mime: 'image/jpeg', w: 1200, h: 900 }])
  await page.getByRole('button', { name: /^Compress 1 image/ }).click()
  await expect(page.getByText(/% smaller/)).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const d = await dl
  expect(d.suggestedFilename()).toBe('photo-compressed.jpg')
  const bytes = readFileSync(await d.path())
  expect(bytes[0]).toBe(0xff); expect(bytes[1]).toBe(0xd8)
})

test('rejects a renamed non-image with a clear message', async ({ page }) => {
  await page.goto('/image-compressor')
  await addRawFile(page, 'fake.png', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  await expect(page.getByRole('alert')).toContainText('not a supported file type')
  await expect(page.getByRole('button', { name: /^Compress/ })).toHaveCount(0)
})

test('resizer never enlarges by default and keeps aspect ratio', async ({ page }) => {
  await page.goto('/image-resizer')
  await addImages(page, [{ name: 'a.png', mime: 'image/png', w: 800, h: 400 }, { name: 'b.png', mime: 'image/png', w: 100, h: 50 }])
  await page.getByLabel('Max width (px)').fill('400')
  await page.getByRole('button', { name: /^Resize 2 images/ }).click()
  await expect(page.getByText('400×200')).toBeVisible()
  await expect(page.getByText('100×50')).toBeVisible()
})

test('converter produces PNG from JPG and ZIP for batches', async ({ page }) => {
  await page.goto('/image-converter')
  await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 300, h: 200 }, { name: 'b.jpg', mime: 'image/jpeg', w: 300, h: 200 }])
  await page.getByLabel('Output format').selectOption('image/png')
  await page.getByRole('button', { name: /^Convert 2 images/ }).click()
  await expect(page.getByText('2 succeeded.')).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download all/ }).click()
  const bytes = readFileSync(await (await dl).path())
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
})
