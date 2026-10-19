import { expect, test } from '@playwright/test'
import { allPages } from '../src/seo/meta'

const PAGES = allPages()
const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const jsonLd = (html: string) => [...html.matchAll(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>)

test.describe('static HTML per route (what crawlers and link previews see without running JavaScript)', () => {
  for (const page of PAGES) {
    test(`${page.path} has its own title, description and social tags`, async ({ request }) => {
      const res = await request.get(page.path)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(page.title)
      expect(attr(html, /<meta name="description" content="([^"]*)"/)).toBe(page.description)
      expect(attr(html, /<meta property="og:title" content="([^"]*)"/)).toBe(page.title)
      expect(attr(html, /<meta property="og:description" content="([^"]*)"/)).toBe(page.description)
      expect(attr(html, /<meta name="twitter:title" content="([^"]*)"/)).toBe(page.title)
      expect(html).toContain('id="root"')
      expect(html).toContain(`<noscript><main><h1>${page.heading.replace(/&/g, '&amp;')}</h1>`)
      expect(html).not.toContain('__SITE_URL__')
    })
  }

  test('canonical URL, og:url and structured data point at the route itself (when a site URL is configured)', async ({ request }) => {
    const home = await (await request.get('/')).text()
    test.skip(!home.includes('rel="canonical"'), 'build has no VITE_SITE_URL, so no absolute URLs are emitted')
    const site = attr(home, /<link rel="canonical" href="([^"]*)\/"/)!
    for (const page of PAGES) {
      const html = await (await request.get(page.path)).text()
      const url = site + page.path
      expect(attr(html, /<link rel="canonical" href="([^"]*)"/), page.path).toBe(url)
      expect(attr(html, /<meta property="og:url" content="([^"]*)"/), page.path).toBe(url)
      const data = jsonLd(html)
      if (page.kind === 'tool') {
        expect(data.map((d) => d['@type']), page.path).toEqual(['BreadcrumbList', 'WebApplication'])
        expect(data[1]).toMatchObject({ url, isAccessibleForFree: true })
      }
      if (page.kind === 'home') expect(data[0]).toMatchObject({ '@type': 'WebSite' })
    }
  })

  test('sitemap lists exactly the indexable routes (when a site URL is configured)', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    test.skip(res.status() === 404 || !(res.headers()['content-type'] ?? '').includes('xml'), 'build has no VITE_SITE_URL, so no sitemap is written')
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)
    expect(locs).toEqual(PAGES.map((p) => p.path))
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:')
  })

  test('the 404 page is not in the sitemap and tells search engines not to index it', async ({ page }) => {
    await page.goto('/no-such-page')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('script[data-seo]')).toHaveCount(0)
  })
})

test.describe('client-side navigation keeps the head in step with the page', () => {
  test('title, description and structured data follow the route', async ({ page }) => {
    await page.goto('/')
    const target = PAGES.find((p) => p.path === '/merge-pdf')!
    await page.goto('/tools')
    await page.getByRole('link', { name: /Merge PDF/ }).first().click()
    await expect(page).toHaveURL(/\/merge-pdf$/)
    await expect(page).toHaveTitle(target.title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', target.description)
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', target.title)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    // never duplicated: one WebApplication and one BreadcrumbList at most, none left from /tools (an ItemList)
    const types = await page.locator('script[data-seo]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? '{}')['@type']))
    expect(types).not.toContain('ItemList')
    expect(new Set(types).size).toBe(types.length)
  })
})
