// Verifies a running deployment (Firebase emulator or live site): every route, caching, security headers.
// Usage: node scripts/verify-hosting.mjs http://127.0.0.1:5002   |   node scripts/verify-hosting.mjs https://your-domain
import { readFileSync } from 'node:fs'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) { console.error('Usage: node scripts/verify-hosting.mjs <base-url>'); process.exit(2) }

const registry = readFileSync('src/tools/registry.ts', 'utf8')
const tools = [...registry.matchAll(/slug: '([^']+)'[^\n]*?status: 'available'/g)].map((m) => `/${m[1]}`)
const contact = /contactEmail: '([^']+)'/.test(readFileSync('src/config/brand.ts', 'utf8')) ? ['/contact'] : [] // only routed once set
const routes = ['/', '/tools', ...tools, '/privacy', '/terms', '/about', ...contact]

try { await fetch(base + '/') } catch (e) { console.error(`Cannot reach ${base} (${e.cause?.code ?? e.message}). Is the server running?`); process.exit(2) }

let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${detail}`}`); if (!ok) failures++ }

if (base.startsWith('https://')) check(true, 'served over HTTPS')
else console.log('NOTE  not HTTPS (expected for local emulator; verify HTTPS on the live domain)')

for (const path of routes) {
  const res = await fetch(base + path, { redirect: 'manual' })
  const html = await res.text()
  check(res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html') && html.includes('id="root"'), `direct navigation ${path}`, `status ${res.status}`)
}

// SEO: every route must serve its own head (what crawlers without JavaScript see), not the home page's.
const titles = new Map()
for (const path of routes) {
  const html = await (await fetch(base + path)).text()
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1]
  check(title !== '' && desc !== '', `SEO title and description ${path}`, `title=${JSON.stringify(title)}`)
  check(!titles.has(title), `SEO title is unique ${path}`, `same as ${titles.get(title)}`)
  titles.set(title, path)
  check(canonical !== undefined && new URL(canonical).pathname === path, `SEO canonical matches route ${path}`, String(canonical))
}
// Full SEO artifact checks (sitemap XML, robots.txt, structured data, true 404s) live in `npm run verify:seo -- <url>`.
{
  const sitemap = await fetch(base + '/sitemap.xml')
  check(sitemap.status === 200 && /xml/.test(sitemap.headers.get('content-type') ?? '') && (await sitemap.text()).startsWith('<?xml'), 'sitemap.xml is served as XML (not the app shell)', `${sitemap.status} ${sitemap.headers.get('content-type')}`)
  const robotsTxt = await (await fetch(base + '/robots.txt')).text()
  check(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m.test(robotsTxt), 'robots.txt points at sitemap.xml')
}
const home = await fetch(base + '/')
const html = await home.text()
check(/no-cache/.test(home.headers.get('cache-control') ?? ''), 'HTML shell is not cached (no-cache)', String(home.headers.get('cache-control')))
const csp = home.headers.get('content-security-policy') ?? ''
check(csp.includes("default-src 'self'") && csp.includes("object-src 'none'"), 'Content-Security-Policy present')
check(home.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff')
check(home.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY')

const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
check(assets.length > 0, 'index.html references hashed assets')
for (const a of assets) {
  const res = await fetch(base + a)
  check(res.status === 200 && /immutable/.test(res.headers.get('cache-control') ?? ''), `hashed asset cached long: ${a}`, String(res.headers.get('cache-control')))
}
// No SPA fallback: unknown URLs get dist/404.html with a real 404 status (it still boots the app's not-found view).
for (const path of ['/definitely-not-a-page', '/404']) {
  const res = await fetch(base + path)
  const body = await res.text()
  check(res.status === 404 && body.includes('id="root"') && body.includes('content="noindex"'), `${path} is a real 404 that renders the app's not-found page`, `status ${res.status}`)
  check(/no-cache/.test(res.headers.get('cache-control') ?? '') && (res.headers.get('content-security-policy') ?? '').includes("default-src 'self'"), `${path} keeps the caching and CSP headers`)
}
const robots = await fetch(base + '/robots.txt')
check(robots.status === 200 && (await robots.text()).includes('User-agent'), 'robots.txt served')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll hosting checks passed')
process.exit(failures ? 1 : 0)
