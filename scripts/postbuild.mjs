// Writes dist/sitemap.xml (and a robots.txt Sitemap line) when VITE_SITE_URL is set, e.g. https://example.com
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'

const site = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '')
if (!site) { console.log('postbuild: VITE_SITE_URL not set, skipping sitemap.xml'); process.exit(0) }

const registry = readFileSync('src/tools/registry.ts', 'utf8')
const tools = [...registry.matchAll(/slug: '([^']+)'[^\n]*?status: 'available'/g)].map((m) => m[1])
// the Contact page only exists once BRAND.contactEmail is set
const contact = /contactEmail: '([^']+)'/.test(readFileSync('src/config/brand.ts', 'utf8')) ? ['/contact'] : []
const paths = ['/', '/tools', ...tools.map((t) => `/${t}`), '/privacy', '/terms', '/about', ...contact]
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`
writeFileSync('dist/sitemap.xml', xml)
if (existsSync('dist/robots.txt')) appendFileSync('dist/robots.txt', `Sitemap: ${site}/sitemap.xml\n`)
console.log(`postbuild: wrote sitemap.xml with ${paths.length} URLs`)
