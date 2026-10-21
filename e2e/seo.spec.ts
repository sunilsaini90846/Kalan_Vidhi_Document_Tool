import { expect, test } from '@playwright/test'
import { BRAND, resolveSiteUrl } from '../src/config/brand'
import { allPages } from '../src/seo/meta'

const PAGES = allPages()
// The origin the build was made for: BRAND.siteUrl unless VITE_SITE_URL overrides it. Never inferred from the page under test.
const SITE = resolveSiteUrl(process.env.VITE_SITE_URL)
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

  test('canonical URL, og:url and structured data point at the route itself, on the site origin', async ({ request }) => {
    for (const page of PAGES) {
      const html = await (await request.get(page.path)).text()
      const url = SITE + (page.path === '/' ? '/' : page.path)
      expect(attr(html, /<link rel="canonical" href="([^"]*)"/), page.path).toBe(url)
      expect(attr(html, /<meta property="og:url" content="([^"]*)"/), page.path).toBe(url)
      expect(attr(html, /<meta property="og:image" content="([^"]*)"/), page.path).toBe(`${SITE}/og-image.png`)
      const data = jsonLd(html)
      if (page.kind === 'tool') {
        expect(data.map((d) => d['@type']), page.path).toEqual(['BreadcrumbList', 'WebApplication'])
        expect(data[1]).toMatchObject({ url, isAccessibleForFree: true })
      }
      if (page.kind === 'home') {
        expect(data.map((d) => d['@type'])).toEqual(['WebSite', 'Organization'])
        expect(data[1]).toMatchObject({ name: BRAND.parent, url: `${BRAND.parentUrl}/` })
      }
    }
  })

  test('sitemap.xml is real XML (not the app shell) and lists exactly the indexable routes', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type'] ?? '').toMatch(/^(application|text)\/xml/)
    const body = await res.text()
    expect(body.startsWith('<?xml')).toBe(true)
    expect(body).not.toContain('id="root"')
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
    expect(locs).toEqual(PAGES.map((p) => SITE + (p.path === '/' ? '/' : p.path)))
    expect(locs.every((l) => l.startsWith('https://') || SITE.startsWith('http://'))).toBe(true)
    expect(locs.some((l) => /\/404\/?$/.test(l))).toBe(false)
  })

  test('robots.txt allows crawling and names the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`)
    expect(text.match(/^Sitemap:/gim)).toHaveLength(1)
    expect(text).not.toMatch(/^Disallow:\s*\/\s*$/m)
  })

  test('unknown URLs are real HTTP 404s that still render the not-found page', async ({ request, page }) => {
    for (const path of ['/no-such-page', '/tools/no-such-tool', '/404']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(404)
      const html = await res.text()
      expect(html, path).toContain('id="root"')
      expect(html, path).toContain('name="robots" content="noindex"')
      expect(html, path).not.toContain('rel="canonical"')
    }
    expect((await request.get('/assets/does-not-exist.js')).status()).toBe(404)
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  })

  test('the 404 page is not in the sitemap and tells search engines not to index it', async ({ page }) => {
    await page.goto('/no-such-page')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('script[data-seo]')).toHaveCount(0)
  })
})

test.describe('every route works on direct navigation and on refresh (there is no SPA fallback: each route is its own file)', () => {
  for (const route of PAGES) {
    test(`${route.path}: 200 on direct load and after reload, with its own canonical`, async ({ page }) => {
      const first = await page.goto(route.path)
      expect(first?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      const canonical = SITE + (route.path === '/' ? '/' : route.path)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
      const second = await page.reload()
      expect(second?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
      await expect(page).toHaveTitle(route.title)
    })
  }
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
