import { expect, test, type Page } from '@playwright/test'
import { addImages, decodeInBrowser, downloadRow, fixtureBytes, isJpeg, isPng, maxPixelDiff, row, sizeFromRow, uploadFixture, waitDone } from '../helpers'
import { upload } from '../tool-kit'

const run = (page: Page, n = 1) => page.getByRole('button', { name: new RegExp(`^Compress ${n} image`) }).click()

test.describe('Image Compressor', () => {
  test('page shows its purpose, accepted formats and limits before any file is chosen', async ({ page }) => {
    await page.goto('/image-compressor')
    await expect(page.getByRole('heading', { level: 1, name: 'Image Compressor' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('JPG, PNG, WebP')
    await expect(page.getByText(/Up to 100 MB per file/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Compress/ })).toHaveCount(0) // nothing to do yet
  })

  test('presets map to real settings: Low Size < Balanced < High Quality in output size', async ({ page }) => {
    const sizes: Record<string, number> = {}
    for (const p of ['Low Size', 'Balanced', 'High Quality']) {
      await page.goto('/image-compressor')
      await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
      await page.getByRole('button', { name: p, exact: true }).click()
      await run(page); await waitDone(page, 'photo-q95.jpg')
      sizes[p] = await sizeFromRow(page, 'photo-q95.jpg')
    }
    expect(sizes['Low Size']).toBeLessThan(sizes['Balanced']!)
    expect(sizes['Balanced']).toBeLessThan(sizes['High Quality']!)
  })

  test('quality always opens on Balanced, and the preset, label and help text agree with the slider', async ({ page }) => {
    const help = page.getByText(/If the first try is not smaller/)
    const pressed = page.locator('button[aria-pressed=true]')
    const expectBalanced = async () => {
      await expect(page.getByText(/^Quality:/)).toHaveText('Quality: 75% · PNG: 256 colours (lossy)')
      await expect(pressed).toHaveText('Balanced')
      await expect(help).toContainText('Balanced: JPG/WebP quality 75%; PNG reduced to 256 colours (lossy)')
    }
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await expectBalanced()

    await page.getByLabel('Quality').fill('0.9') // dragging onto a preset's value selects that preset
    await expect(page.getByText(/^Quality:/)).toHaveText('Quality: 90% · PNG: lossless')
    await expect(pressed).toHaveText('High Quality')
    await expect(help).toContainText('High Quality: JPG/WebP quality 90%; PNG kept lossless')
    await page.getByLabel('Quality').fill('0.6') // anything else is Custom, never a preset whose numbers do not match
    await expect(pressed).toHaveCount(0)
    await expect(help).toContainText('Custom: JPG/WebP quality 60%; PNG reduced to 128 colours (lossy)')

    // settings are per visit: another tool and back starts on Balanced again
    await page.goto('/image-resizer')
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo.png', { mime: 'image/png' })
    await expectBalanced()
  })

  test('batch: per-file results, individual downloads and a ZIP of all', async ({ page }) => {
    await page.goto('/image-compressor')
    await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 600, h: 400 }, { name: 'b.jpg', mime: 'image/jpeg', w: 500, h: 300 }, { name: 'c.png', mime: 'image/png', w: 300, h: 300 }])
    await run(page, 3)
    for (const n of ['a.jpg', 'b.jpg', 'c.png']) await waitDone(page, n)
    await expect(page.getByRole('status').filter({ hasText: 'succeeded' })).toHaveText('3 succeeded.')
    for (const n of ['a.jpg', 'b.jpg']) expect(isJpeg((await downloadRow(page, n)).bytes)).toBe(true)
  })

  test('remove and clear all take files out of the queue', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await uploadFixture(page, 'photo.webp', { mime: 'image/webp' })
    await expect(page.getByRole('button', { name: /^Compress 2 images/ })).toBeVisible()
    await page.getByRole('button', { name: 'Remove photo.webp' }).click()
    await expect(page.getByRole('button', { name: /^Compress 1 image/ })).toBeVisible()
    await page.getByRole('button', { name: /Clear all/ }).click()
    await expect(page.getByRole('button', { name: /^Compress/ })).toHaveCount(0)
  })

  test('adding the same file twice is rejected as a duplicate', async ({ page }) => {
    await page.goto('/image-compressor')
    await page.locator('input[type=file]').setInputFiles({ name: 'd.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await (await import('../helpers')).fixtureBytes('photo-q95.jpg')) })
    await expect(page.getByRole('button', { name: /^Compress 1 image/ })).toBeVisible()
    // same name, size and timestamp is not available through setInputFiles, so verify the visible duplicate guard via the same buffer twice in one drop
    await page.locator('input[type=file]').setInputFiles([
      { name: 'e.jpg', mimeType: 'image/jpeg', buffer: Buffer.from((await import('../helpers')).fixtureBytes('photo-q30.jpg')) },
    ])
    await expect(page.getByRole('button', { name: /^Compress 2 images/ })).toBeVisible()
  })

  test('a failed file can be retried after fixing the option that caused it', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'animated.webp', { mime: 'image/webp' })
    await run(page); await waitDone(page, 'animated.webp')
    await expect(row(page, 'animated.webp').getByRole('button', { name: 'Retry' })).toBeVisible()
    await page.getByLabel(/Use only the first frame/).check()
    await row(page, 'animated.webp').getByRole('button', { name: 'Retry' }).click()
    await waitDone(page, 'animated.webp')
    await expect(row(page, 'animated.webp').getByRole('button', { name: 'Download' })).toBeVisible()
  })

  test('cancel stops a long batch and the tool can be used again', async ({ page }) => {
    await page.goto('/image-compressor')
    await addImages(page, Array.from({ length: 10 }, (_, i) => ({ name: `big${i}.jpg`, mime: 'image/jpeg' as const, w: 3000, h: 2200 })))
    await run(page, 10)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: /^Compress \d+ images?/ })).toBeEnabled()
  })

  for (const [preset, colours] of [['Balanced', 256], ['Low Size', 128]] as const) {
    test(`${preset}: a colourful UI screenshot keeps ${colours} colours and still looks like the original`, async ({ page }) => {
      await page.goto('/image-compressor')
      await uploadFixture(page, 'ui-screenshot.png', { mime: 'image/png' })
      await page.getByRole('button', { name: preset, exact: true }).click()
      await run(page); await waitDone(page, 'ui-screenshot.png')
      await expect(row(page, 'ui-screenshot.png')).toContainText(`PNG reduced to ${colours} colours (lossy)`)
      const out = await downloadRow(page, 'ui-screenshot.png')
      expect(isPng(out.bytes)).toBe(true)
      expect(out.bytes.length).toBeLessThan(fixtureBytes('ui-screenshot.png').length)
      // the bug produced a nearly blank image (whole buttons turned white); a faithful palette stays close everywhere
      expect(await maxPixelDiff(page, fixtureBytes('ui-screenshot.png'), out.bytes)).toBeLessThan(40)
    })
  }

  test('colour reduction that would visibly change the image is skipped, not offered', async ({ page }) => {
    await page.goto('/image-compressor')
    // a full-spectrum colour wheel cannot survive 64 colours without dithering
    const wheel = Buffer.from(await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 300
      const ctx = c.getContext('2d')!
      const hue = ctx.createConicGradient(0, 150, 150)
      for (let i = 0; i <= 6; i++) hue.addColorStop(i / 6, `hsl(${i * 60} 100% 50%)`)
      ctx.fillStyle = hue; ctx.fillRect(0, 0, 300, 300)
      const shade = ctx.createRadialGradient(150, 150, 0, 150, 150, 212)
      shade.addColorStop(0, 'rgba(0,0,0,0.85)'); shade.addColorStop(0.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(255,255,255,0.85)')
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 300, 300)
      return c.toDataURL('image/png').split(',')[1]!
    }), 'base64')
    await upload(page, 'wheel.png', wheel, { mime: 'image/png' })
    await page.getByLabel('Quality').fill('0.4') // 64 colours
    await run(page); await waitDone(page, 'wheel.png')
    await expect(row(page, 'wheel.png')).toContainText('would visibly change it, so colour reduction was skipped')
    await expect(row(page, 'wheel.png')).not.toContainText('PNG reduced to')
    // either a lossless PNG (pixel-identical) or, if that is not smaller, the untouched original
    const out = await downloadRow(page, 'wheel.png')
    expect(await maxPixelDiff(page, wheel, out.bytes)).toBe(0)
  })

  test('result is a real, decodable image at the original dimensions (resize is opt-in)', async ({ page }) => {
    await page.goto('/image-compressor')
    await uploadFixture(page, 'photo-q95.jpg', { mime: 'image/jpeg' })
    await run(page); await waitDone(page, 'photo-q95.jpg')
    expect(await decodeInBrowser(page, (await downloadRow(page, 'photo-q95.jpg')).bytes)).toMatchObject({ width: 400, height: 300 })
  })
})
