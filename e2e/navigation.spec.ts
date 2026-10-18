import { expect, test } from '@playwright/test'
import { BRAND } from '../src/config/brand'

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

test('header links every tool category, including Archive tools, and marks only the current one', async ({ page, isMobile }) => {
  await page.goto('/')
  const menu = () => (isMobile ? page.getByRole('button', { name: 'Open menu' }).click() : Promise.resolve())
  const nav = page.getByRole('navigation', { name: isMobile ? 'Mobile' : 'Main' })
  await menu()
  for (const label of ['Image tools', 'PDF tools', 'Document tools', 'Archive tools']) await expect(nav.getByRole('link', { name: label })).toBeVisible()
  await nav.getByRole('link', { name: 'Archive tools' }).click()
  await expect(page).toHaveURL(/\/tools\?category=archive$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Archive tools' })).toBeVisible()
  await expect(page.getByRole('link', { name: /ZIP Tools/ })).toBeVisible()
  await menu()
  await expect(nav.locator('[aria-current=page]')).toHaveText('Archive tools')
})

test('no placeholder Contact page: no footer link and /contact is not found until an address is configured', async ({ page }) => {
  test.skip(!!BRAND.contactEmail, 'a contact address is configured')
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'About' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Contact' })).toHaveCount(0)
  await page.goto('/contact')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('tools search keeps every keystroke, even typed as fast as possible', async ({ page }) => {
  await page.goto('/tools?category=pdf')
  const box = page.getByRole('main').getByRole('searchbox', { name: 'Search tools' })
  for (let i = 0; i < 5; i++) {
    await box.fill('')
    await box.pressSequentially('zip') // no delay between keys
    await expect(box).toHaveValue('zip')
  }
  await expect(page.getByRole('status')).toHaveText('1 tool')
  await expect(page.getByRole('link', { name: /Split PDF/ })).toBeVisible()
  await expect(page).toHaveURL(/category=pdf/)
  await expect(page).toHaveURL(/q=zip/)
  await page.getByRole('button', { name: 'All', exact: true }).click() // the query survives a category change
  await expect(box).toHaveValue('zip')
  await expect(page).toHaveURL(/\/tools\?q=zip$/)
  await expect(page.getByRole('link', { name: /ZIP Tools/ })).toBeVisible()
})

test('header search while on the tools page replaces the query in the tools field', async ({ page, isMobile }) => {
  await page.goto('/tools')
  const box = page.getByRole('main').getByRole('searchbox', { name: 'Search tools' })
  await box.pressSequentially('zip')
  await expect(page).toHaveURL(/q=zip/)
  if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click()
  const header = page.getByRole('navigation', { name: isMobile ? 'Mobile' : 'Main' }).getByRole('searchbox', { name: 'Search tools' })
  await header.fill('merge'); await header.press('Enter')
  await expect(page).toHaveURL(/\/tools\?q=merge$/)
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search tools' })).toHaveValue('merge')
  await expect(page.getByRole('status')).toHaveText('1 tool')
})
