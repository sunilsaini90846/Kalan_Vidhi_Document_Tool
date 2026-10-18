import { expect, test } from '@playwright/test'
import { closeSync, openSync, writeSync, ftruncateSync } from 'node:fs'
import { fixtureBytes } from './helpers'

/** The per-file and per-batch limits shown in every dropzone are enforced with real files, before any processing. */
test.describe('upload limits', () => {
  test('a real file over 100 MB is refused up front with its size and the limit', async ({ page }, info) => {
    // a genuine PNG signature padded to 101 MB (sparse on disk); too big for an in-memory buffer upload
    const path = info.outputPath('huge.png')
    const fd = openSync(path, 'w'); writeSync(fd, fixtureBytes('photo.png').subarray(0, 64)); ftruncateSync(fd, 101 * 1024 * 1024); closeSync(fd)
    await page.goto('/image-compressor')
    await page.locator('input[type=file]').setInputFiles(path)
    await expect(page.getByRole('alert')).toHaveText('"huge.png" is 101.0 MB; the limit is 100.0 MB.')
    await expect(page.getByRole('button', { name: /^Compress/ })).toHaveCount(0)
  })

  test('more than 50 files: the first 50 are accepted and the rest are refused with the limit', async ({ page }) => {
    await page.goto('/image-compressor')
    const tiny = fixtureBytes('tiny-1x1.png')
    await page.locator('input[type=file]').setInputFiles(Array.from({ length: 52 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: tiny })))
    await expect(page.getByRole('button', { name: 'Compress 50 images' })).toBeVisible()
    await expect(page.getByRole('alert').getByRole('listitem')).toHaveText(['You can select up to 50 files.', 'You can select up to 50 files.'])
    // the cap counts files already chosen, so adding more later is refused too
    await page.locator('input[type=file]').setInputFiles({ name: 'late.png', mimeType: 'image/png', buffer: tiny })
    await expect(page.getByRole('alert')).toHaveText('You can select up to 50 files.')
    await expect(page.getByRole('button', { name: 'Compress 50 images' })).toBeVisible()
  })
})
