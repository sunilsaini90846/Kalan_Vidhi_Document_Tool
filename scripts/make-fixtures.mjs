// Generates the genuine image fixtures in ./fixtures. Needs: npm i --no-save sharp
// Usage: node scripts/make-fixtures.mjs
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

mkdirSync('fixtures', { recursive: true })
const out = (n, b) => { writeFileSync(`fixtures/${n}`, b); console.log(n, b.length) }

/** Photo-like RGB noise-over-gradient so lossy codecs have real work to do. */
function photo(w, h, channels = 3, seed = 1) {
  const b = Buffer.alloc(w * h * channels)
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * channels
    b[i] = (x / w) * 200 + rnd() * 55; b[i + 1] = (y / h) * 200 + rnd() * 55; b[i + 2] = ((x + y) / (w + h)) * 200 + rnd() * 55
    if (channels === 4) b[i + 3] = 255
  }
  return b
}
const raw = (w, h, c, seed) => ({ raw: { width: w, height: h, channels: c } })

const W = 400, H = 300
out('photo-q95.jpg', await sharp(photo(W, H), raw(W, H, 3)).jpeg({ quality: 95 }).toBuffer())
out('photo-q30.jpg', await sharp(photo(W, H, 3, 2), raw(W, H, 3)).jpeg({ quality: 30 }).toBuffer())
// Stored landscape pixels with EXIF orientation 6 (displays as 300x400 portrait)
out('photo-exif6.jpg', await sharp(photo(W, H), raw(W, H, 3)).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer())
out('photo.png', await sharp(photo(W, H), raw(W, H, 3)).png({ compressionLevel: 1 }).toBuffer())

// Transparent PNG: a soft-edged disc with partial alpha
const a = photo(W, H, 4, 3)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = Math.hypot(x - W / 2, y - H / 2); a[(y * W + x) * 4 + 3] = d > 140 ? 0 : d > 120 ? Math.round(255 * (140 - d) / 20) : 255
}
out('alpha.png', await sharp(a, raw(W, H, 4)).png({ compressionLevel: 1 }).toBuffer())
out('alpha.webp', await sharp(a, raw(W, H, 4)).webp({ quality: 95 }).toBuffer())
out('photo.webp', await sharp(photo(W, H), raw(W, H, 3)).webp({ quality: 95 }).toBuffer())
out('photo.avif', await sharp(photo(W, H), raw(W, H, 3)).avif({ quality: 60 }).toBuffer())
out('photo.tiff', await sharp(photo(W, H), raw(W, H, 3)).tiff({ compression: 'lzw' }).toBuffer())
out('tiny-1x1.png', await sharp({ create: { width: 1, height: 1, channels: 3, background: '#c33' } }).png().toBuffer())

// Static + animated GIF / WebP
const frames = await Promise.all([1, 2, 3].map((n) => sharp(photo(64, 48, 3, n), raw(64, 48, 3)).png().toBuffer()))
out('static.gif', await sharp(photo(W, H), raw(W, H, 3)).gif().toBuffer())
const stack = (fr) => sharp(Buffer.concat(fr.map((f) => f.data)), { raw: { width: 64, height: 48 * fr.length, channels: 3, pageHeight: 48 } })
const rawFrames = await Promise.all(frames.map((f) => sharp(f).raw().toBuffer({ resolveWithObject: true })))
out('animated.gif', await stack(rawFrames).gif({ loop: 0, delay: [100, 100, 100] }).toBuffer())
out('animated.webp', await stack(rawFrames).webp({ loop: 0, delay: [100, 100, 100] }).toBuffer())

// BMP 24-bit (bottom-up), written by hand
{
  const w = 40, h = 30, row = Math.ceil((w * 3) / 4) * 4, px = photo(w, h)
  const buf = Buffer.alloc(54 + row * h)
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 3, d = 54 + y * row + x * 3; buf[d] = px[s + 2]; buf[d + 1] = px[s + 1]; buf[d + 2] = px[s] }
  out('photo.bmp', buf)
}
// ICO wrapping a 32x32 PNG
{
  const png = await sharp(photo(32, 32, 4, 5), raw(32, 32, 4)).png().toBuffer()
  const head = Buffer.alloc(22); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4)
  head[6] = 32; head[7] = 32; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18)
  out('icon.ico', Buffer.concat([head, png]))
}
// APNG: a real PNG with acTL + fcTL/fdAT frames spliced in
{
  const chunk = (type, data) => { const t = Buffer.from(type), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]) }
  const base = await sharp(photo(32, 32), raw(32, 32, 3)).png().toBuffer()
  const idat = []; let p = 8, ihdr
  while (p < base.length) { const len = base.readUInt32BE(p), type = base.toString('ascii', p + 4, p + 8); if (type === 'IHDR') ihdr = base.subarray(p, p + 12 + len); if (type === 'IDAT') idat.push(base.subarray(p + 8, p + 8 + len)); p += 12 + len }
  const fctl = (seq) => { const d = Buffer.alloc(26); d.writeUInt32BE(seq); d.writeUInt32BE(32, 4); d.writeUInt32BE(32, 8); d.writeUInt16BE(10, 20); d.writeUInt16BE(100, 22); return chunk('fcTL', d) }
  const actl = Buffer.alloc(8); actl.writeUInt32BE(2); actl.writeUInt32BE(0)
  const fdat = Buffer.concat([Buffer.alloc(4, 0), Buffer.concat(idat)]); fdat.writeUInt32BE(2)
  out('animated.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, chunk('acTL', actl), fctl(0), ...idat.map((d) => chunk('IDAT', d)), fctl(1), chunk('fdAT', fdat), chunk('IEND', Buffer.alloc(0))]))
}
out('logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#4f46e5"/><circle cx="100" cy="50" r="30" fill="#fff" fill-opacity="0.8"/></svg>'))
out('malicious.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><image href="https://evil.example/x.png"/></svg>'))
// Corrupt / truncated inputs
const good = await sharp(photo(W, H), raw(W, H, 3)).jpeg().toBuffer()
out('truncated.jpg', good.subarray(0, Math.floor(good.length / 3)))
out('corrupt.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]))
