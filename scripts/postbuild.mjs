// After `vite build`:
//  1. writes one static HTML file per route (dist/<route>/index.html) with that route's own title, description,
//     canonical URL, social tags, structured data and a no-JavaScript fallback, so crawlers and link previews that
//     do not run JavaScript see the right page. The React app still mounts on top as usual.
//  2. writes dist/sitemap.xml and a robots.txt Sitemap line when VITE_SITE_URL is set, e.g. https://example.com
// The route list and all copy come from src/seo/meta.ts, the same module the app uses at runtime.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { loadEnv } from 'vite'

// Same lookup as the site-url plugin in vite.config.ts (.env files and the process environment).
const site = (loadEnv('production', process.cwd(), 'VITE_').VITE_SITE_URL ?? '').replace(/\/$/, '')

// Bundle the TypeScript module so Node can import it. It is written inside node_modules so its externals resolve.
const bundle = resolve('node_modules/.cache/seo/meta.mjs')
await build({ entryPoints: ['src/seo/meta.ts'], bundle: true, format: 'esm', platform: 'node', outfile: bundle, packages: 'external', logLevel: 'error' })
const { allPages, jsonLdFor, serializeJsonLd } = await import(pathToFileURL(bundle).href)
const pages = allPages()

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Replaces a tag the template must already contain; a missing tag fails the build instead of shipping stale SEO. */
function replaceTag(html, pattern, tag, label) {
  if (!pattern.test(html)) throw new Error(`postbuild: dist/index.html has no ${label} tag to rewrite`)
  return html.replace(pattern, () => tag)
}
const metaPattern = (attr, key) => new RegExp(`<meta ${attr}="${key}"[^>]*>`)

function renderPage(template, page) {
  const url = site + (page.path === '/' ? '/' : page.path)
  let html = template
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escText(page.title)}</title>`, '<title>')
  for (const [attr, key, value] of [
    ['name', 'description', page.description],
    ['property', 'og:title', page.title],
    ['property', 'og:description', page.description],
    ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description],
  ]) html = replaceTag(html, metaPattern(attr, key), `<meta ${attr}="${key}" content="${esc(value)}" />`, key)
  if (site) {
    html = replaceTag(html, metaPattern('property', 'og:url'), `<meta property="og:url" content="${esc(url)}" />`, 'og:url')
    html = replaceTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`, 'canonical')
  }
  const ld = jsonLdFor(page, site).map((d) => `    <script type="application/ld+json" data-seo>${serializeJsonLd(d)}</script>\n`).join('')
  html = html.replace('  </head>', () => `${ld}  </head>`)
  const fallback = `<noscript><main><h1>${escText(page.heading)}</h1><p>${escText(page.description)}</p><p>The tools on this site run in your browser and need JavaScript to be enabled.</p><p><a href="/tools">All tools</a></p></main></noscript>`
  return replaceTag(html, /<div id="root"><\/div>/, `<div id="root"></div>\n    ${fallback}`, '#root')
}

if (!existsSync('dist/index.html')) throw new Error('postbuild: dist/index.html is missing; run vite build first')
const template = readFileSync('dist/index.html', 'utf8')
if (/rel="canonical"/.test(template) !== Boolean(site)) throw new Error('postbuild: the site URL seen by vite build and by postbuild differ; canonical tags would be wrong')
for (const page of pages) {
  const html = renderPage(template, page)
  if (page.path === '/') { writeFileSync('dist/index.html', html); continue }
  mkdirSync(`dist${page.path}`, { recursive: true })
  writeFileSync(`dist${page.path}/index.html`, html)
}
console.log(`postbuild: wrote ${pages.length} route HTML files${site ? '' : ' (no canonical URLs or structured data: VITE_SITE_URL not set)'}`)

if (!site) { console.log('postbuild: VITE_SITE_URL not set, skipping sitemap.xml'); process.exit(0) }
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${esc(site + p.path)}</loc></url>`).join('\n')}\n</urlset>\n`
writeFileSync('dist/sitemap.xml', xml)
if (existsSync('dist/robots.txt')) appendFileSync('dist/robots.txt', `Sitemap: ${site}/sitemap.xml\n`)
console.log(`postbuild: wrote sitemap.xml with ${pages.length} URLs`)
