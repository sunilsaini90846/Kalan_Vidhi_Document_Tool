/** The SEO checkers that gate the production build must actually fail on broken artifacts, not just pass on good ones. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BRAND } from '@/config/brand'
import { NOT_FOUND_PAGE, allPages, jsonLdFor, serializeJsonLd, type PageSeo } from '@/seo/meta'
import { checkDist, checkNotFoundHtml, checkRobots, checkRouteHtml, checkSitemap, checkUniqueCopy } from '../../scripts/lib/seo-checks.mjs'

const site = BRAND.siteUrl
const parentUrl = BRAND.parentUrl
const pages = allPages()
const paths = pages.map((p) => p.path)
const url = (p: PageSeo) => site + (p.path === '/' ? '/' : p.path)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const sitemap = (locs: string[], head = '<?xml version="1.0" encoding="UTF-8"?>\n') =>
  `${head}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((l) => `  <url><loc>${l}</loc></url>`).join('\n')}\n</urlset>\n`
const goodSitemap = sitemap(pages.map(url))
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`

function routeHtml(page: PageSeo, { robotsMeta = 'index, follow', canonical = url(page), ld = jsonLdFor(page, site).map((d) => serializeJsonLd(d)) } = {}) {
  return `<!doctype html><html lang="en"><head><title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}" /><meta name="robots" content="${robotsMeta}" />
<meta property="og:title" content="${esc(page.title)}" /><meta property="og:description" content="${esc(page.description)}" />
<meta name="twitter:title" content="${esc(page.title)}" /><meta name="twitter:description" content="${esc(page.description)}" />
<meta property="og:image" content="${site}/og-image.png" /><meta name="twitter:image" content="${site}/og-image.png" />
<meta property="og:url" content="${url(page)}" /><link rel="canonical" href="${canonical}" />
${ld.map((d) => `<script type="application/ld+json">${d}</script>`).join('\n')}</head>
<body><div id="root"></div><noscript><main><h1>${esc(page.heading)}</h1></main></noscript></body></html>`
}
const tool = pages.find((p) => p.kind === 'tool')!
const ctx = (page: PageSeo) => ({ site, parentUrl, page })

describe('checkSitemap', () => {
  const expected = { site, paths }
  it('accepts a correct sitemap', () => expect(checkSitemap(goodSitemap, expected)).toEqual([]))
  it('rejects the SPA shell served in place of the sitemap (the Search Console "Sitemap is HTML" error)', () => {
    expect(checkSitemap('<!doctype html>\n<html lang="en"><head></head><body><div id="root"></div></body></html>', expected)).toEqual(['sitemap is an HTML document, not XML'])
  })
  it('rejects malformed XML', () => expect(checkSitemap(goodSitemap.replace('</urlset>', ''), expected)[0]).toMatch(/not well-formed XML/))
  it('rejects an unescaped ampersand', () => expect(checkSitemap(sitemap([...pages.map(url).slice(1), `${site}/a&b`]), expected)[0]).toMatch(/not well-formed XML/))
  it('rejects a wrong namespace', () => expect(checkSitemap(goodSitemap.replace('sitemaps.org/schemas', 'example.org/schemas'), expected)[0]).toMatch(/urlset/))
  it('rejects the wrong host, http, a Firebase default host, query strings and trailing slashes', () => {
    const bad = [
      ...pages.map(url).slice(2),
      'http://doctool.kalanvidhi.com/', 'https://document-operations.web.app/tools', `${site}/tools?category=pdf`, `${site}/merge-pdf/`, `${site}/404`, `${site}/merge-pdf`, `${site}/merge-pdf`,
    ]
    const errors = checkSitemap(sitemap(bad), expected).join('\n')
    expect(errors).toContain('wrong host or scheme')
    expect(errors).toContain('query string')
    expect(errors).toContain('trailing slash')
    expect(errors).toContain('more than once')
    expect(errors).toContain('lists the 404 page')
    expect(errors).toContain('missing indexable routes')
  })
  it('rejects a sitemap with a missing or extra route', () => {
    expect(checkSitemap(sitemap(pages.map(url).slice(1)), expected).join()).toContain('missing indexable routes')
    expect(checkSitemap(sitemap([...pages.map(url), `${site}/coming-soon-tool`]), expected).join()).toContain('not indexable routes')
  })
  it('requires the XML declaration to come first', () => expect(checkSitemap(` ${goodSitemap}`, expected).join()).toContain('XML declaration'))
})

describe('checkRobots', () => {
  it('accepts a correct file', () => expect(checkRobots(robots, { site })).toEqual([]))
  it('requires exactly one Sitemap line for the right URL (the live site had none)', () => {
    expect(checkRobots('User-agent: *\nAllow: /\n', { site }).join()).toContain('exactly one')
    expect(checkRobots(`${robots}Sitemap: ${site}/sitemap.xml\n`, { site }).join()).toContain('exactly one')
    expect(checkRobots(robots.replace(site, 'https://kalanvidhi.com'), { site }).join()).toContain('exactly one')
  })
  it('rejects blocking the site, scripts or styles, and HTML in place of robots.txt', () => {
    expect(checkRobots(`${robots}Disallow: /\n`, { site }).join()).toContain('blocks the whole site')
    expect(checkRobots(`${robots}Disallow: /assets/\n`, { site }).join()).toContain('scripts or styles')
    expect(checkRobots('<!doctype html><html></html>', { site })).toEqual(['robots.txt is an HTML document'])
  })
})

describe('checkRouteHtml', () => {
  it('accepts a correct page', () => expect(checkRouteHtml(routeHtml(tool), ctx(tool))).toEqual([]))
  it('accepts every page kind', () => { for (const p of pages) expect(checkRouteHtml(routeHtml(p), ctx(p)), p.path).toEqual([]) })
  it('rejects a canonical on the wrong host, the wrong path, or missing', () => {
    expect(checkRouteHtml(routeHtml(tool, { canonical: 'https://document-operations.web.app/x' }), ctx(tool)).join()).toContain('canonical must be exactly')
    expect(checkRouteHtml(routeHtml(tool, { canonical: `${site}/` }), ctx(tool)).join()).toContain('canonical must be exactly')
    expect(checkRouteHtml(routeHtml(tool).replace(/<link rel="canonical"[^>]*>/, ''), ctx(tool)).join()).toContain('canonical must be exactly')
  })
  it('rejects noindex, a leftover placeholder, a wrong title and unparseable JSON-LD', () => {
    expect(checkRouteHtml(routeHtml(tool, { robotsMeta: 'noindex' }), ctx(tool)).join()).toContain('blocks indexing')
    expect(checkRouteHtml(routeHtml(tool).replace(`${site}/og-image.png`, '__SITE_URL__/og-image.png'), ctx(tool)).join()).toContain('__SITE_URL__')
    expect(checkRouteHtml(routeHtml(tool).replace(/<title>.*<\/title>/, '<title>Home</title>'), ctx(tool)).join()).toContain('title is')
    expect(checkRouteHtml(routeHtml(tool, { ld: ['{ not json'] }), ctx(tool)).join()).toContain('invalid JSON-LD')
  })
  it('rejects an Organization that points at the product subdomain, and invented ratings', () => {
    const home = pages[0]!
    const wrongOrg = jsonLdFor(home, site).map((d) => serializeJsonLd(JSON.parse(JSON.stringify(d).replaceAll(`${parentUrl}/`, `${site}/`))))
    expect(checkRouteHtml(routeHtml(home, { ld: wrongOrg }), ctx(home)).join()).toContain('Organization url must be')
    const rated = [...jsonLdFor(tool, site).map((d) => serializeJsonLd(d)), JSON.stringify({ '@type': 'Thing', aggregateRating: { ratingValue: 5 } })]
    expect(checkRouteHtml(routeHtml(tool, { ld: rated }), ctx(tool)).join()).toContain('ratings or reviews')
  })
  it('rejects missing structured data for a tool page', () => expect(checkRouteHtml(routeHtml(tool, { ld: [] }), ctx(tool)).join()).toContain('missing a WebApplication'))
})

describe('checkNotFoundHtml', () => {
  const notFoundHtml = `<!doctype html><html lang="en"><head><title>${NOT_FOUND_PAGE.title}</title><meta name="robots" content="noindex" /></head><body><div id="root"></div></body></html>`
  it('accepts a noindex page without canonical', () => expect(checkNotFoundHtml(notFoundHtml)).toEqual([]))
  it('rejects index, follow, a canonical, og:url and structured data', () => {
    const errors = checkNotFoundHtml(notFoundHtml.replace('noindex', 'index, follow').replace('</head>', `<link rel="canonical" href="${site}/" /><meta property="og:url" content="${site}/" /><script type="application/ld+json">{}</script></head>`)).join()
    for (const m of ['noindex', 'canonical', 'og:url', 'structured data']) expect(errors).toContain(m)
  })
})

describe('checkUniqueCopy', () => {
  it('accepts the real pages and flags a duplicated title or description', () => {
    expect(checkUniqueCopy(pages)).toEqual([])
    expect(checkUniqueCopy([pages[0]!, { ...pages[1]!, title: pages[0]!.title }]).join()).toContain('title duplicates')
    expect(checkUniqueCopy([pages[0]!, { ...pages[1]!, description: pages[0]!.description }]).join()).toContain('description duplicates')
  })
})

describe('checkDist', () => {
  const write = (dir: string, rel: string, body: string) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), body) }
  const build = (without?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-dist-'))
    const files: Record<string, string> = { 'sitemap.xml': goodSitemap, 'robots.txt': robots, '404.html': `<!doctype html><html lang="en"><head><title>${NOT_FOUND_PAGE.title}</title><meta name="robots" content="noindex" /></head><body><div id="root"></div></body></html>`, 'og-image.png': 'x', 'favicon.svg': 'x', 'manifest.webmanifest': '{}' }
    for (const p of pages) files[p.path === '/' ? 'index.html' : `${p.path.slice(1)}/index.html`] = routeHtml(p)
    for (const [rel, body] of Object.entries(files)) if (rel !== without) write(dir, rel, body)
    return dir
  }
  const notFound = NOT_FOUND_PAGE
  it('passes a complete build output', () => {
    const dir = build()
    try { expect(checkDist(dir, { site, parentUrl, pages, notFound })).toEqual([]) } finally { rmSync(dir, { recursive: true }) }
  })
  for (const missing of ['sitemap.xml', 'robots.txt', '404.html', 'merge-pdf/index.html']) {
    it(`fails when ${missing} is missing, which is what made the live sitemap return HTML`, () => {
      const dir = build(missing)
      try { expect(checkDist(dir, { site, parentUrl, pages, notFound }).join()).toContain(`${missing} is missing`) } finally { rmSync(dir, { recursive: true }) }
    })
  }
})
