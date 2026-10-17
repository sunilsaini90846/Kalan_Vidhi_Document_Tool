import { expect, test } from '@playwright/test'

for (const path of ['/', '/tools', '/image-compressor', '/image-resizer', '/image-converter', '/image-to-pdf', '/merge-pdf', '/split-pdf', '/rotate-pdf', '/extract-pdf-pages', '/pdf-compressor', '/docx-optimizer', '/pptx-optimizer', '/xlsx-optimizer', '/zip-tools', '/odf-optimizer', '/epub-optimizer', '/privacy']) {
  test(`direct navigation to ${path} works`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
test('unknown route shows 404', async ({ page }) => {
  await page.goto('/nope')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
