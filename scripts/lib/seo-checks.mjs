// SEO artifact checks shared by the production build (scripts/postbuild.mjs), `npm run verify:seo` and the unit tests.
// Every function returns a list of human-readable problems; an empty list means the artifact is good.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'

export const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

/** Strict XML parse (throws on malformed input, unlike an HTML parser, which would accept anything). */
export function parseXml(xml) {
  return new JSDOM(xml, { contentType: 'text/xml' }).window.document
}

const urlFor = (site, path) => site + (path === '/' ? '/' : path)

/**
 * @param {string} xml sitemap text
 * @param {{ site: string, paths: string[] }} ctx expected origin and the exact set of indexable route paths
 */
export function checkSitemap(xml, { site, paths }) {
  const errors = []
  if (/^\s*<!doctype html|^\s*<html/i.test(xml)) return ['sitemap is an HTML document, not XML']
  if (!xml.startsWith('<?xml')) errors.push('sitemap has no XML declaration at the very start')
  let doc
  try { doc = parseXml(xml) } catch (e) { return [...errors, `sitemap is not well-formed XML: ${String(e.message).split('\n')[0]}`] }
  const root = doc.documentElement
  if (root.localName !== 'urlset' || root.namespaceURI !== SITEMAP_NS) return [...errors, `sitemap root must be <urlset xmlns="${SITEMAP_NS}">`]
  const entries = [...root.children]
  if (entries.some((e) => e.localName !== 'url')) errors.push('sitemap has elements other than <url>')
  if (entries.length > 50_000) errors.push('sitemap has more than 50,000 URLs')
  const origin = new URL(site).origin
  const locs = []
  for (const entry of entries) {
    const locEls = [...entry.children].filter((c) => c.localName === 'loc')
    if (locEls.length !== 1) { errors.push('every <url> needs exactly one <loc>'); continue }
    const raw = locEls[0].textContent.trim()
    locs.push(raw)
    let u
    try { u = new URL(raw) } catch { errors.push(`not an absolute URL: ${raw}`); continue }
    if (u.origin !== origin) errors.push(`wrong host or scheme (expected ${origin}): ${raw}`)
    if (u.search || u.hash) errors.push(`has a query string or fragment: ${raw}`)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) errors.push(`trailing slash (the canonical form has none): ${raw}`)
    if (raw !== u.href) errors.push(`not in normalized form (${u.href}): ${raw}`)
    for (const c of entry.children) {
      if (c.localName === 'lastmod' && Number.isNaN(Date.parse(c.textContent))) errors.push(`invalid <lastmod> for ${raw}`)
    }
  }
  if (new Set(locs).size !== locs.length) errors.push('sitemap lists a URL more than once')
  if (locs.some((l) => /\/404\/?$/.test(l))) errors.push('sitemap lists the 404 page')
  const expected = paths.map((p) => urlFor(site, p))
  const missing = expected.filter((u) => !locs.includes(u))
  const extra = locs.filter((u) => !expected.includes(u))
  if (missing.length) errors.push(`sitemap is missing indexable routes: ${missing.join(', ')}`)
  if (extra.length) errors.push(`sitemap lists URLs that are not indexable routes: ${extra.join(', ')}`)
  return errors
}

export function checkRobots(text, { site }) {
  const errors = []
  if (/<html|<!doctype/i.test(text)) return ['robots.txt is an HTML document']
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const sitemapLines = lines.filter((l) => /^sitemap:/i.test(l))
  if (sitemapLines.length !== 1 || sitemapLines[0].replace(/^sitemap:\s*/i, '') !== `${site}/sitemap.xml`) {
    errors.push(`robots.txt must contain exactly one "Sitemap: ${site}/sitemap.xml" line (found ${JSON.stringify(sitemapLines)})`)
  }
  if (!lines.some((l) => /^user-agent:\s*\*$/i.test(l))) errors.push('robots.txt has no "User-agent: *" group')
  if (lines.some((l) => /^disallow:\s*\/\s*$/i.test(l))) errors.push('robots.txt blocks the whole site')
  if (lines.some((l) => /^disallow:.*(\/assets|\.js|\.css)/i.test(l))) errors.push('robots.txt blocks scripts or styles needed to render the site')
  return errors
}

const metaContent = (doc, attr, key) => [...doc.querySelectorAll(`meta[${attr}="${key}"]`)].map((m) => m.getAttribute('content') ?? '')

function ldBlocks(doc, errors, label) {
  const blocks = []
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { blocks.push(JSON.parse(el.textContent ?? '')) } catch (e) { errors.push(`${label}: invalid JSON-LD (${e.message})`) }
  }
  return blocks
}

/** Every URL-valued field in JSON-LD must be absolute and on the product or parent origin. */
function ldUrls(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => ldUrls(n, out))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'url' || k === 'item' || k === '@id') && typeof v === 'string') out.push(v)
      else ldUrls(v, out)
    }
  }
  return out
}

/**
 * Checks the HTML a crawler receives for one indexable route.
 * @param {string} html
 * @param {{ site: string, parentUrl: string, page: { path: string, kind: string, title: string, description: string } }} ctx
 */
export function checkRouteHtml(html, { site, parentUrl, page }) {
  const label = page.path
  const errors = []
  const doc = new JSDOM(html).window.document
  const url = urlFor(site, page.path)
  const add = (msg) => errors.push(`${label}: ${msg}`)

  if (html.includes('__SITE_URL__')) add('contains the unreplaced __SITE_URL__ placeholder')
  if (doc.documentElement.getAttribute('lang') !== 'en') add('<html lang="en"> is missing')
  if (!doc.getElementById('root')) add('no #root element')
  if (doc.title !== page.title) add(`title is ${JSON.stringify(doc.title)}, expected ${JSON.stringify(page.title)}`)
  const descriptions = metaContent(doc, 'name', 'description')
  if (descriptions.length !== 1 || descriptions[0] !== page.description) add('needs exactly one meta description equal to the page description')
  const canonicals = [...doc.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute('href'))
  if (canonicals.length !== 1 || canonicals[0] !== url) add(`canonical must be exactly ${url} (found ${JSON.stringify(canonicals)})`)
  const ogUrl = metaContent(doc, 'property', 'og:url')
  if (ogUrl.length !== 1 || ogUrl[0] !== url) add(`og:url must be exactly ${url} (found ${JSON.stringify(ogUrl)})`)
  for (const [attr, key] of [['property', 'og:title'], ['name', 'twitter:title']]) {
    if (metaContent(doc, attr, key)[0] !== page.title) add(`${key} does not match the title`)
  }
  for (const [attr, key] of [['property', 'og:description'], ['name', 'twitter:description']]) {
    if (metaContent(doc, attr, key)[0] !== page.description) add(`${key} does not match the description`)
  }
  for (const key of ['og:image']) {
    const v = metaContent(doc, 'property', key)[0] ?? ''
    if (!v.startsWith(`${site}/`)) add(`${key} must be an absolute URL on ${site} (found ${JSON.stringify(v)})`)
  }
  if (!(metaContent(doc, 'name', 'twitter:image')[0] ?? '').startsWith(`${site}/`)) add('twitter:image must be an absolute URL on the site')
  for (const r of metaContent(doc, 'name', 'robots')) if (/noindex|none/i.test(r)) add(`meta robots blocks indexing (${r})`)
  if (!doc.querySelector('noscript h1')) add('no-JavaScript fallback has no <h1>')

  const blocks = ldBlocks(doc, errors, label)
  const types = blocks.flatMap((b) => (Array.isArray(b) ? b : [b])).map((b) => b['@type'])
  const expected = page.kind === 'tool' ? ['BreadcrumbList', 'WebApplication'] : page.kind === 'home' ? ['WebSite', 'Organization'] : page.kind === 'tools' ? ['BreadcrumbList', 'ItemList'] : []
  for (const t of expected) if (!types.includes(t)) add(`structured data is missing a ${t}`)
  const origins = [new URL(site).origin, new URL(parentUrl).origin]
  for (const u of ldUrls(blocks)) {
    let ok = false
    try { ok = origins.includes(new URL(u).origin) } catch { /* handled below */ }
    if (!ok) add(`structured data URL is not absolute on ${origins.join(' or ')}: ${u}`)
  }
  for (const b of blocks.flat()) {
    if (b['@type'] === 'Organization' && b.url !== `${parentUrl}/`) add(`Organization url must be ${parentUrl}/ (found ${b.url})`)
    if (b['@type'] === 'WebApplication' && b.url !== url) add(`WebApplication url must be ${url}`)
  }
  if (/aggregateRating|ratingValue|"review"/i.test(JSON.stringify(blocks))) add('structured data contains ratings or reviews')
  return errors
}

/** The 404 page must be noindex and must not claim a canonical URL or carry structured data. */
export function checkNotFoundHtml(html) {
  const errors = []
  const doc = new JSDOM(html).window.document
  const add = (msg) => errors.push(`404 page: ${msg}`)
  if (!doc.getElementById('root')) add('no #root element, so the app cannot render the not-found view')
  if (!metaContent(doc, 'name', 'robots').some((r) => /noindex/i.test(r))) add('missing <meta name="robots" content="noindex">')
  if (doc.querySelector('link[rel="canonical"]')) add('must not have a canonical link')
  if (doc.querySelector('meta[property="og:url"]')) add('must not have og:url')
  if (doc.querySelector('script[type="application/ld+json"]')) add('must not have structured data')
  if (!doc.title) add('has no title')
  return errors
}

export function checkUniqueCopy(pages) {
  const errors = []
  for (const key of ['title', 'description']) {
    const seen = new Map()
    for (const p of pages) {
      if (!p[key]) errors.push(`${p.path}: empty ${key}`)
      if (seen.has(p[key])) errors.push(`${p.path}: ${key} duplicates ${seen.get(p[key])}`)
      seen.set(p[key], p.path)
    }
  }
  return errors
}

/** Whether `dist/` holds every SEO artifact the site depends on, and each one is correct. */
export function checkDist(dist, { site, parentUrl, pages, notFound }) {
  const errors = []
  const read = (rel) => {
    const file = resolve(dist, rel)
    if (!existsSync(file)) { errors.push(`${rel} is missing from the build output`); return undefined }
    return readFileSync(file, 'utf8')
  }
  errors.push(...checkUniqueCopy(pages))
  const sitemap = read('sitemap.xml')
  if (sitemap !== undefined) errors.push(...checkSitemap(sitemap, { site, paths: pages.map((p) => p.path) }))
  const robots = read('robots.txt')
  if (robots !== undefined) errors.push(...checkRobots(robots, { site }))
  for (const page of pages) {
    const html = read(page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`)
    if (html !== undefined) errors.push(...checkRouteHtml(html, { site, parentUrl, page }))
  }
  const missing = read('404.html')
  if (missing !== undefined) {
    errors.push(...checkNotFoundHtml(missing))
    if (!missing.includes(`<title>${notFound.title}</title>`)) errors.push('404.html has the wrong title')
  }
  for (const asset of ['og-image.png', 'favicon.svg', 'manifest.webmanifest']) if (!existsSync(resolve(dist, asset))) errors.push(`${asset} is missing from the build output`)
  return errors
}
