// SEO verification. Read-only: it only reads dist/ and issues GET requests.
//
//   npm run verify:seo                                        check the production build output in dist/
//   npm run verify:seo -- http://127.0.0.1:5002               ...and the Firebase Hosting emulator over HTTP
//   npm run verify:seo -- https://doctool.kalanvidhi.com --no-dist --production
//                                                             live site only (never deploys anything)
//
// Flags: --no-dist skips the dist/ checks (needed when no build exists, e.g. when checking the live site);
//        --production additionally requires the canonical host to be the production host from src/config/brand.ts.
// A URL may be the emulator or the live site: canonicals are always compared with the site URL the build was made
// for, never with the host that happens to be serving the request.
import { existsSync } from 'node:fs'
import { checkDist, checkNotFoundHtml, checkRobots, checkRouteHtml, checkSitemap } from './lib/seo-checks.mjs'
import { loadSeoSource } from './lib/seo-source.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? '').replace(/\/$/, '')
const { site, parentUrl, productionUrl, pages, notFound } = await loadSeoSource()

let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n        ${[].concat(detail).join('\n        ')}`}`); if (!ok) failures++ }
const group = (label, errors) => check(errors.length === 0, label, errors)

console.log(`Site URL under test: ${site}`)
if (flag('--production')) check(site === productionUrl, `site URL is the production URL ${productionUrl}`, `got ${site}; unset VITE_SITE_URL or set it to ${productionUrl}`)

if (!flag('--no-dist')) {
  if (!existsSync('dist/index.html')) { console.error('FAIL  dist/ has no build output. Run `npm run build` first (or pass --no-dist to check only a URL).'); process.exit(1) }
  group('build output: sitemap, robots, 404 page, every route HTML, structured data', checkDist('dist', { site, parentUrl, pages, notFound }))
} else if (!base) { console.error('FAIL  --no-dist needs a URL to check.'); process.exit(2) }

if (base) {
  console.log(`\nHTTP checks against ${base}`)
  try { await fetch(base + '/') } catch (e) { console.error(`Cannot reach ${base} (${e.cause?.code ?? e.message}). Is the server running?`); process.exit(2) }
  const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init })
  const loopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(base)
  const noIndexHeader = (res) => /noindex|none/i.test(res.headers.get('x-robots-tag') ?? '')

  const sm = await get('/sitemap.xml')
  const smType = sm.headers.get('content-type') ?? ''
  const smBody = await sm.text()
  check(sm.status === 200, '/sitemap.xml returns 200', `status ${sm.status}`)
  check(/^(application|text)\/xml/.test(smType), '/sitemap.xml is served as XML, not HTML', `content-type: ${smType}`)
  group('/sitemap.xml body is a valid sitemap of exactly the indexable routes', checkSitemap(smBody, { site, paths: pages.map((p) => p.path) }))

  const rb = await get('/robots.txt')
  check(rb.status === 200 && (rb.headers.get('content-type') ?? '').startsWith('text/plain'), '/robots.txt returns 200 text/plain', `status ${rb.status}, ${rb.headers.get('content-type')}`)
  group('/robots.txt allows crawling and declares the sitemap', checkRobots(await rb.text(), { site }))

  // Every indexable route (the same list the sitemap is checked against above), requested on the host under test.
  for (const page of pages) {
    const res = await get(page.path)
    const ct = res.headers.get('content-type') ?? ''
    const html = await res.text()
    check(res.status === 200 && ct.includes('text/html') && !noIndexHeader(res), `${page.path}: 200 HTML, no X-Robots-Tag noindex`, `status ${res.status}, ${ct}`)
    group(`${page.path}: canonical, metadata, structured data`, checkRouteHtml(html, { site, parentUrl, page }))
  }

  // Unknown URLs must be real 404s that still boot the app's not-found view.
  const unknown = ['/this-page-does-not-exist', '/tools/not-a-real-tool', '/404']
  if (!loopback) unknown.push('/Image-Compressor') // Hosting is case-sensitive; a local case-insensitive filesystem would give a false 200
  for (const path of unknown) {
    const res = await get(path)
    const html = await res.text()
    check(res.status === 404 && (res.headers.get('content-type') ?? '').includes('text/html'), `${path}: real HTTP 404`, `status ${res.status}`)
    group(`${path}: 404 page is noindex with no canonical`, checkNotFoundHtml(html))
  }
  const missingAsset = await get('/assets/definitely-missing.js')
  check(missingAsset.status === 404, 'a missing /assets file is a 404, not the app shell', `status ${missingAsset.status}`)

  // Redirect hygiene.
  const slash = await get(`${pages[2].path}/`)
  check([301, 308].includes(slash.status) && new URL(slash.headers.get('location') ?? '', base).pathname === pages[2].path, `${pages[2].path}/ redirects to ${pages[2].path}`, `status ${slash.status} -> ${slash.headers.get('location')}`)

  // Static files must be served as themselves.
  const home = await (await get('/')).text()
  const asset = home.match(/(?:src|href)="(\/assets\/[^"]+\.js)"/)?.[1]
  for (const [path, type] of [['/og-image.png', /^image\/png/], ['/favicon.svg', /^image\/svg\+xml/], ['/manifest.webmanifest', /manifest\+json/], ...(asset ? [[asset, /javascript/]] : [])]) {
    const res = await get(path)
    check(res.status === 200 && type.test(res.headers.get('content-type') ?? ''), `static file ${path} is served as itself`, `status ${res.status}, ${res.headers.get('content-type')}`)
  }
}

console.log(failures ? `\n${failures} SEO check(s) failed` : '\nAll SEO checks passed')
process.exit(failures ? 1 : 0)
