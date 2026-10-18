// Verifies a running deployment (Firebase emulator or live site): every route, caching, security headers.
// Usage: node scripts/verify-hosting.mjs http://127.0.0.1:5002   |   node scripts/verify-hosting.mjs https://your-domain
import { readFileSync } from 'node:fs'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) { console.error('Usage: node scripts/verify-hosting.mjs <base-url>'); process.exit(2) }

const registry = readFileSync('src/tools/registry.ts', 'utf8')
const tools = [...registry.matchAll(/slug: '([^']+)'[^\n]*?status: 'available'/g)].map((m) => `/${m[1]}`)
const contact = /contactEmail: '([^']+)'/.test(readFileSync('src/config/brand.ts', 'utf8')) ? ['/contact'] : [] // only routed once set
const routes = ['/', '/tools', ...tools, '/privacy', '/terms', '/about', ...contact, '/404']

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
const spa = await fetch(base + '/definitely-not-a-page')
check(spa.status === 200 && (await spa.text()).includes('id="root"'), 'unknown path falls back to the app (client-side 404 page)')
const robots = await fetch(base + '/robots.txt')
check(robots.status === 200 && (await robots.text()).includes('User-agent'), 'robots.txt served')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll hosting checks passed')
process.exit(failures ? 1 : 0)
