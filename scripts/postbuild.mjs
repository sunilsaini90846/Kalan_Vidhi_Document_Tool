// After `vite build`:
//  1. writes one static HTML file per route (dist/<route>/index.html) with that route's own title, description,
//     canonical URL, social tags, structured data and a no-JavaScript fallback, so crawlers and link previews that
//     do not run JavaScript see the right page. The React app still mounts on top as usual.
//  2. writes dist/404.html, the page Firebase Hosting serves with HTTP 404 for every URL that is not a route
//     (noindex, no canonical, no structured data; the React app mounts on it and renders the not-found view)
//  3. always writes dist/sitemap.xml and dist/robots.txt (with its Sitemap directive)
//  4. verifies all of the above and FAILS the build if any SEO artifact is missing or wrong (scripts/lib/seo-checks.mjs)
// The route list, copy and site URL come from src/seo/meta.ts and src/config/brand.ts, the same modules the app uses at
// runtime. The site URL is https://doctool.kalanvidhi.com unless VITE_SITE_URL overrides it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { checkDist } from './lib/seo-checks.mjs'
import { loadSeoSource } from './lib/seo-source.mjs'

const { site, parentUrl, pages, notFound, jsonLdFor, serializeJsonLd } = await loadSeoSource()

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Replaces a tag the template must already contain; a missing tag fails the build instead of shipping stale SEO. */
function replaceTag(html, pattern, tag, label) {
  if (!pattern.test(html)) throw new Error(`postbuild: dist/index.html has no ${label} tag to rewrite`)
  return html.replace(pattern, () => tag)
}
const metaPattern = (attr, key) => new RegExp(`<meta ${attr}="${key}"[^>]*>`)

function renderPage(template, page, { indexable = true } = {}) {
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
  if (indexable) {
    html = replaceTag(html, metaPattern('property', 'og:url'), `<meta property="og:url" content="${esc(url)}" />`, 'og:url')
    html = replaceTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`, 'canonical')
  } else {
    // The not-found page is not a real URL: it must not claim a canonical or an og:url, and it must not be indexed.
    html = replaceTag(html, metaPattern('property', 'og:url'), '', 'og:url')
    html = replaceTag(html, /<link rel="canonical"[^>]*>/, '', 'canonical')
    html = replaceTag(html, metaPattern('name', 'robots'), '<meta name="robots" content="noindex" />', 'robots')
  }
  const ld = (indexable ? jsonLdFor(page, site) : []).map((d) => `    <script type="application/ld+json" data-seo>${serializeJsonLd(d)}</script>\n`).join('')
  html = html.replace('  </head>', () => `${ld}  </head>`)
  const fallback = `<noscript><main><h1>${escText(page.heading)}</h1><p>${escText(page.description)}</p><p>The tools on this site run in your browser and need JavaScript to be enabled.</p><p><a href="/tools">All tools</a></p></main></noscript>`
  return replaceTag(html, /<div id="root"><\/div>/, `<div id="root"></div>\n    ${fallback}`, '#root')
}

if (!existsSync('dist/index.html')) throw new Error('postbuild: dist/index.html is missing; run vite build first')
const template = readFileSync('dist/index.html', 'utf8')
if (!template.includes(`<link rel="canonical" href="${site}/" />`)) throw new Error(`postbuild: the site URL seen by vite build and by postbuild differ (expected ${site}); canonical tags would be wrong`)
for (const page of pages) {
  const html = renderPage(template, page)
  if (page.path === '/') { writeFileSync('dist/index.html', html); continue }
  mkdirSync(`dist${page.path}`, { recursive: true })
  writeFileSync(`dist${page.path}/index.html`, html)
}
writeFileSync('dist/404.html', renderPage(template, notFound, { indexable: false }))
console.log(`postbuild: wrote ${pages.length} route HTML files and 404.html for ${site}`)

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${esc(site + (p.path === '/' ? '/' : p.path))}</loc></url>`).join('\n')}\n</urlset>\n`
writeFileSync('dist/sitemap.xml', xml)
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`)
console.log(`postbuild: wrote sitemap.xml with ${pages.length} URLs and robots.txt`)

const problems = checkDist('dist', { site, parentUrl, pages, notFound })
if (problems.length) {
  console.error(`postbuild: ${problems.length} SEO problem(s); refusing to produce a build with broken SEO artifacts:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log('postbuild: SEO artifacts verified')
