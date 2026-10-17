// Renders the PNG icons and social image from public/favicon.svg. Needs: npm i --no-save sharp
// Usage: node scripts/make-icons.mjs
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg')
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${name}`, await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
}
const icon = await sharp(svg, { density: 384 }).resize(220, 220).png().toBuffer()
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#eef2ff"/>
<text x="360" y="285" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="#4f46e5" letter-spacing="3">KALAN VIDHI</text>
<text x="360" y="365" font-family="Helvetica, Arial, sans-serif" font-size="78" font-weight="700" fill="#0f172a">Doc Tool</text>
<text x="360" y="430" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#334155">Free, private file compression and conversion.</text>
<text x="360" y="480" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#475569">Runs in your browser. No sign-up.</text></svg>`
writeFileSync('public/og-image.png', await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#eef2ff' } }).composite([{ input: Buffer.from(og) }, { input: icon, left: 110, top: 205 }]).png().toBuffer())
console.log('icons written')
