import { readFileSync } from 'node:fs'
import { BRAND } from '@/config/brand'
import { allPages, jsonLdFor, seoForPath, serializeJsonLd } from '@/seo/meta'
import { TOOL_SEO } from '@/seo/tool-seo'
import { TOOLS, availableTools } from '@/tools/registry'

const SITE = 'https://example.com'
const tools = allPages().filter((p) => p.kind === 'tool')

describe('tool search copy', () => {
  it('every available tool has its own entry, and no entry is left over', () => {
    expect(Object.keys(TOOL_SEO).sort()).toEqual(availableTools().map((t) => t.slug).sort())
  })

  it('coming-soon tools are not published as pages', () => {
    const soon = TOOLS.filter((t) => t.status !== 'available').map((t) => `/${t.slug}`)
    expect(allPages().map((p) => p.path).filter((p) => soon.includes(p))).toEqual([])
  })

  for (const page of tools) {
    it(`${page.path}: title and description fit a search result`, () => {
      expect(page.title.length, page.title).toBeLessThanOrEqual(65)
      expect(page.title.endsWith(` | ${BRAND.name}`)).toBe(true)
      expect(page.description.length, page.description).toBeGreaterThanOrEqual(80)
      expect(page.description.length, page.description).toBeLessThanOrEqual(160)
    })
    it(`${page.path}: makes no invented saving claim`, () => {
      expect(page.description).not.toMatch(/\d\s?%/)
      expect(page.description).not.toMatch(/\b(guarantee|best|fastest|lossless)\b/i)
    })
  }

  it('titles and descriptions are unique across all pages', () => {
    const pages = allPages()
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length)
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length)
  })
})

describe('routes', () => {
  it('lists every available tool plus the fixed pages, and never /404', () => {
    const paths = allPages().map((p) => p.path)
    for (const t of availableTools()) expect(paths).toContain(`/${t.slug}`)
    expect(paths).toEqual(expect.arrayContaining(['/', '/tools', '/privacy', '/terms', '/about']))
    expect(paths).not.toContain('/404')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('/contact is listed only while a contact address is set', () => {
    expect(allPages().some((p) => p.path === '/contact')).toBe(Boolean(BRAND.contactEmail))
  })

  it('looks pages up ignoring a trailing slash, and returns nothing for unknown paths', () => {
    expect(seoForPath('/merge-pdf/')?.path).toBe('/merge-pdf')
    expect(seoForPath('/')?.kind).toBe('home')
    expect(seoForPath('/no-such-page')).toBeUndefined()
  })

  it('the static home tags in index.html match the home page data', () => {
    const html = readFileSync('index.html', 'utf8')
    const home = seoForPath('/')!
    expect(html).toContain(`<title>${home.title}</title>`)
    expect(html).toContain(`<meta name="description" content="${home.description}" />`)
    expect(html).toContain(`<meta property="og:title" content="${home.title}" />`)
  })
})

describe('structured data', () => {
  it('is empty until the site URL is known (it needs absolute URLs)', () => {
    for (const p of allPages()) expect(jsonLdFor(p, '')).toEqual([])
  })

  it('a tool page has a breadcrumb trail and a free WebApplication, all on absolute URLs', () => {
    const page = seoForPath('/pdf-compressor')!
    const [crumbs, app] = jsonLdFor(page, SITE) as [Record<string, any>, Record<string, any>]
    expect(crumbs.itemListElement.map((i: any) => i.item)).toEqual([`${SITE}/`, `${SITE}/tools`, `${SITE}/pdf-compressor`])
    expect(app).toMatchObject({ '@type': 'WebApplication', name: 'PDF Compressor', url: `${SITE}/pdf-compressor`, isAccessibleForFree: true, offers: { price: '0' } })
  })

  it('never includes ratings or reviews (there are none)', () => {
    for (const p of allPages()) expect(JSON.stringify(jsonLdFor(p, SITE))).not.toMatch(/aggregateRating|review|ratingValue/i)
  })

  it('home has a WebSite entry and the tools page lists every available tool', () => {
    expect(jsonLdFor(seoForPath('/')!, SITE)[0]).toMatchObject({ '@type': 'WebSite', url: `${SITE}/` })
    const list = jsonLdFor(seoForPath('/tools')!, SITE).find((d) => d['@type'] === 'ItemList') as { itemListElement: unknown[] }
    expect(list.itemListElement).toHaveLength(availableTools().length)
  })

  it('serialises so that it cannot close its own <script> element', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)</script>' })).not.toContain('<')
  })
})
