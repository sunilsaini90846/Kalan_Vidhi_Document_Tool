import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { addImages, addRawFile } from './helpers'

const ROUTES = ['/', '/tools', '/image-compressor', '/image-resizer', '/image-converter', '/image-to-pdf', '/merge-pdf', '/split-pdf', '/rotate-pdf', '/extract-pdf-pages', '/pdf-compressor', '/docx-optimizer', '/pptx-optimizer', '/xlsx-optimizer', '/zip-tools', '/odf-optimizer', '/epub-optimizer', '/privacy', '/terms', '/about', '/contact', '/404']

test.describe('accessibility (axe, WCAG 2 A/AA)', () => {
  for (const path of ROUTES) {
    test(`no violations on ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.getByRole('heading', { level: 1 }).waitFor()
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    })
  }

  test('image tool with results has no violations', async ({ page }) => {
    await page.goto('/image-compressor')
    await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 600, h: 400 }])
    await page.getByRole('button', { name: /^Compress 1 image/ }).click()
    await expect(page.getByText(/% smaller|well optimized|larger/).first()).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(violations.map((v) => v.id)).toEqual([])
  })
})

test('mobile menu works with the keyboard', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only')
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Open menu' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'PDF tools' }).click()
  await expect(page).toHaveURL(/category=pdf/)
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toHaveCount(0)
})

test('skip link is the first focusable element', async ({ page }) => {
  await page.goto('/privacy')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
})

test('tool search and category filters', async ({ page }) => {
  await page.goto('/tools')
  await page.getByPlaceholder(/Search by name/).fill('merge')
  await expect(page.getByRole('link', { name: /Merge PDF/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Image Compressor/ })).toHaveCount(0)
  await page.getByPlaceholder(/Search by name/).fill('')
  await page.getByRole('button', { name: 'Archive tools' }).click()
  await expect(page.getByRole('link', { name: /ZIP Tools/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Merge PDF/ })).toHaveCount(0)
  await page.getByPlaceholder(/Search by name/).fill('zzzz')
  await expect(page.getByText('No tools match your search.')).toBeVisible()
})

test('homepage upload opens the right tool and keeps the file', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') })
  await expect(page).toHaveURL(/\/pdf-compressor$/)
  // the dropped file was validated by the tool page (this stub is not a parseable PDF, so a clear error appears)
  await expect(page.getByRole('alert')).toBeVisible()
})

test('homepage rejects unsupported types without navigating', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ-not-supported') })
  await expect(page.getByRole('alert')).toContainText('not supported')
  await expect(page).toHaveURL(/\/$/)
})

test('a corrupt image fails cleanly, offers retry, and the page keeps working', async ({ page }) => {
  await page.goto('/image-compressor')
  // valid PNG signature but garbage body
  await addRawFile(page, 'broken.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8])
  await addImages(page, [{ name: 'ok.jpg', mime: 'image/jpeg', w: 400, h: 300 }])
  await page.getByRole('button', { name: /^Compress 2 images/ }).click()
  await expect(page.getByText('1 succeeded, 1 failed.')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'could not be decoded' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('heavy work runs in a Web Worker', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (w) => workers.push(w.url()))
  await page.goto('/image-compressor')
  await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 500, h: 400 }])
  await page.getByRole('button', { name: /^Compress 1 image/ }).click()
  await expect(page.getByText(/% smaller|well optimized/).first()).toBeVisible()
  expect(workers.some((u) => /tasks\.worker/.test(u))).toBe(true)
})

test('cancel stops a running batch and the tool is usable again', async ({ page }) => {
  await page.goto('/image-compressor')
  await addImages(page, Array.from({ length: 12 }, (_, i) => ({ name: `big${i}.jpg`, mime: 'image/jpeg' as const, w: 3000, h: 2200 })))
  await page.getByRole('button', { name: /^Compress 12 images/ }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: /^Compress \d+ images?/ })).toBeEnabled()
})

test.describe('under the production Content Security Policy', () => {
  const csp = (JSON.parse(readFileSync('firebase.json', 'utf8')).hosting.headers as { headers: { key: string; value: string }[] }[])
    .flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value

  test('tools, workers and downloads work with no CSP violations', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()) })
    await page.route('**/*', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } })
    })
    await page.goto('/image-to-pdf')
    await addImages(page, [{ name: 'a.jpg', mime: 'image/jpeg', w: 500, h: 400 }])
    await page.getByRole('button', { name: 'Create PDF' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'PDF ready and verified' })).toBeVisible()
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: /^Download .*\.pdf/ }).click()
    expect((await dl).suggestedFilename()).toBe('images.pdf')
    expect(violations).toEqual([])
  })
})
