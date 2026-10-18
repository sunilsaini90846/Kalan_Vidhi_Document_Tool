import { readFileSync } from 'node:fs'
import { unzlibSync } from 'fflate'
import { detectKind } from '@/services/file-validation/signatures'
import { detectAnimation } from './animation'
import { readDimensions } from './dimensions'
import { encodePngIndexed, encodePngTruecolor, quantize, reconstruct, type Rgba } from './png'

const fx = (n: string) => new Uint8Array(readFileSync(`fixtures/${n}`))
const kindOf = (n: string) => detectKind(fx(n).subarray(0, 512))

describe('signature detection on genuine fixtures', () => {
  it.each([
    ['photo-q95.jpg', 'jpeg'], ['photo.png', 'png'], ['alpha.webp', 'webp'], ['static.gif', 'gif'], ['animated.gif', 'gif'],
    ['photo.bmp', 'bmp'], ['photo.tiff', 'tiff'], ['photo.avif', 'avif'], ['icon.ico', 'ico'], ['logo.svg', 'svg'], ['animated.png', 'png'], ['animated.webp', 'webp'],
  ])('%s is %s', (file, kind) => expect(kindOf(file)).toBe(kind))
  it('does not mistake garbage, text or short files', () => {
    expect(detectKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe('unknown')
    expect(detectKind(new TextEncoder().encode('hello world\n'))).toBe('text')
    expect(detectKind(new Uint8Array(0))).toBe('unknown')
    expect(detectKind(new Uint8Array([0x42, 0x4d, 0, 0]))).toBe('unknown') // "BM" alone is not enough for BMP
  })
  it('recognises other formats by signature', () => {
    expect(detectKind(new TextEncoder().encode('{\\rtf1\\ansi'))).toBe('rtf')
    expect(detectKind(Uint8Array.of(0x1f, 0x8b, 8, 0))).toBe('gzip')
    expect(detectKind(Uint8Array.of(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0))).toBe('7z')
    expect(detectKind(Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0))).toBe('rar')
    const ftyp = (brand: string) => Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[...'mif1'].map((c) => c.charCodeAt(0)), ...[...'heic'].map((c) => c.charCodeAt(0))])
    expect(detectKind(ftyp('heic'))).toBe('heic')
    expect(detectKind(ftyp('isom'))).toBe('heic') // compatible brands include heic
    expect(detectKind(Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]))).toBe('mp4')
  })
  it('detects SVG even with an XML prolog, and rejects HTML', () => {
    expect(detectKind(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
    expect(detectKind(new TextEncoder().encode('<html><body>x</body></html>'))).toBe('text')
  })
})

describe('animation detection', () => {
  it.each([['animated.gif', true], ['static.gif', false], ['animated.png', true], ['photo.png', false], ['animated.webp', true], ['alpha.webp', false], ['photo.avif', false]])('%s animated=%s', (file, animated) => {
    expect(detectAnimation(kindOf(file), fx(file)).animated).toBe(animated)
  })
  it('counts GIF frames', () => expect(detectAnimation('gif', fx('animated.gif')).frames).toBeGreaterThan(1))
  it('treats truncated data as not animated rather than crashing', () => {
    expect(detectAnimation('gif', fx('animated.gif').subarray(0, 20)).animated).toBe(false)
    expect(detectAnimation('png', fx('animated.png').subarray(0, 12)).animated).toBe(false)
  })
})

describe('header dimensions', () => {
  it.each([['photo-q95.jpg', 400, 300], ['photo-exif6.jpg', 400, 300], ['photo.png', 400, 300], ['photo.webp', 400, 300], ['alpha.webp', 400, 300], ['static.gif', 400, 300], ['photo.bmp', 40, 30], ['photo.avif', 400, 300], ['tiny-1x1.png', 1, 1]])('%s is %ix%i', (file, w, h) => {
    expect(readDimensions(kindOf(file), fx(file))).toEqual({ width: w, height: h })
  })
  it('does not trust a PNG whose IHDR chunk is missing or malformed (damaged, not huge)', () => {
    expect(readDimensions('png', fx('corrupt.png'))).toBeNull()
    const bad = fx('photo.png').slice(); bad[12] = 0x58
    expect(readDimensions('png', bad)).toBeNull()
  })
  it('returns null when it cannot know', () => {
    expect(readDimensions('tiff', fx('photo.tiff'))).toBeNull()
    expect(readDimensions('png', fx('photo.png').subarray(0, 10))).toBeNull()
  })
})

/** Independent PNG decoder: the oracle for the encoder. */
function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const v = new DataView(png.buffer, png.byteOffset)
  let p = 8, width = 0, height = 0, depth = 0, ct = 0
  let plte: Uint8Array = new Uint8Array(0), trns: Uint8Array = new Uint8Array(0)
  const idat: Uint8Array[] = []
  while (p < png.length) {
    const len = v.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8)), body = png.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { width = v.getUint32(p + 8); height = v.getUint32(p + 12); depth = body[8]!; ct = body[9]! }
    if (type === 'PLTE') plte = body
    if (type === 'tRNS') trns = body
    if (type === 'IDAT') idat.push(body)
    p += 12 + len
  }
  const comp = new Uint8Array(idat.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of idat) { comp.set(a, o); o += a.length }
  const raw = unzlibSync(comp)
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1, bpp = Math.max(1, (ch * depth) >> 3), rowBytes = Math.ceil((width * ch * depth) / 8)
  const px = new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (rowBytes + 1)]!
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[y * (rowBytes + 1) + 1 + i]!, a = i >= bpp ? px[y * rowBytes + i - bpp]! : 0, b = y ? px[(y - 1) * rowBytes + i]! : 0, c = y && i >= bpp ? px[(y - 1) * rowBytes + i - bpp]! : 0
      const pa = Math.abs(a + b - c - a), pb = Math.abs(a + b - c - b), pc = Math.abs(a + b - c - c)
      px[y * rowBytes + i] = (x + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]!) & 255
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (ct === 3) {
      const bit = i % width * depth, byte = px[Math.floor(i / width) * rowBytes + (bit >> 3)]!, idx = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
      rgba.set([plte[idx * 3]!, plte[idx * 3 + 1]!, plte[idx * 3 + 2]!, idx < trns.length ? trns[idx]! : 255], i * 4)
    } else if (ct === 2) rgba.set([px[i * 3]!, px[i * 3 + 1]!, px[i * 3 + 2]!, 255], i * 4)
    else rgba.set(px.subarray(i * 4, i * 4 + 4), i * 4)
  }
  return { width, height, rgba }
}

function image(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4)
  return { data, width: w, height: h }
}

describe('PNG encoder', () => {
  const noisy = image(37, 23, (x, y) => [(x * 7 + y * 3) & 255, (x * y) & 255, (x ^ y) * 5 & 255, 255])
  const withAlpha = image(31, 19, (x, y) => [x * 8, y * 13, 200, x < 10 ? 0 : x < 20 ? 128 : 255])

  it('opaque truecolor round-trips exactly (RGB, color type 2)', () => {
    const png = encodePngTruecolor(noisy)
    expect(png[25]).toBe(2)
    expect(decodePng(png).rgba).toEqual(Uint8Array.from(noisy.data))
  })
  it('RGBA round-trips exactly (color type 6)', () => {
    const png = encodePngTruecolor(withAlpha)
    expect(png[25]).toBe(6)
    expect(decodePng(png).rgba).toEqual(Uint8Array.from(withAlpha.data))
  })
  it('is exact when the image already has few colours, at every bit depth', () => {
    for (const colors of [2, 3, 12, 100]) {
      const img = image(29, 17, (x, y) => [((x + y) % colors) * 2, 50, 90, 255])
      const q = quantize(img, 256)
      expect(q.exact).toBe(true)
      expect(decodePng(encodePngIndexed(q, 29, 17)).rgba).toEqual(Uint8Array.from(img.data))
    }
  })
  it('quantizes to at most N colours and the PNG decodes to exactly the palette image', () => {
    const q = quantize(noisy, 16)
    expect(q.exact).toBe(false)
    expect(q.palette.length / 4).toBeLessThanOrEqual(16)
    expect(decodePng(encodePngIndexed(q, 37, 23)).rgba).toEqual(reconstruct(q, 37, 23))
  })
  it('keeps full transparency and partial alpha through quantization', () => {
    const q = quantize(image(40, 40, (x, y) => [x * 6, y * 6, (x * y) & 255, x < 8 ? 0 : x < 16 ? 100 : 255]), 32)
    const out = decodePng(encodePngIndexed(q, 40, 40)).rgba
    const alphas = new Set<number>(); for (let i = 3; i < out.length; i += 4) alphas.add(out[i]!)
    expect(alphas.has(0)).toBe(true)
    expect([...alphas].some((a) => a > 0 && a < 255)).toBe(true)
  })
  it('compresses a flat graphic far below raw size', () => {
    const flat = image(200, 200, (x) => [x < 100 ? 255 : 0, 0, 0, 255])
    expect(encodePngTruecolor(flat).length).toBeLessThan((200 * 200 * 3) / 100) // under 1% of raw
  })
  it('handles 1x1 images', () => {
    const one = image(1, 1, () => [9, 8, 7, 255])
    expect(decodePng(encodePngTruecolor(one)).rgba).toEqual(Uint8Array.of(9, 8, 7, 255))
    expect(decodePng(encodePngIndexed(quantize(one, 256), 1, 1)).rgba).toEqual(Uint8Array.of(9, 8, 7, 255))
  })
})

describe('PNG colour reduction keeps images recognisable', () => {
  const screenshot = (() => { const d = decodePng(fx('ui-screenshot.png')); return { data: d.rgba, width: d.width, height: d.height } })()

  it.each([256, 128])('a mostly white UI screenshot keeps all %i colours (it used to collapse to 1–2)', (n) => {
    const q = quantize(screenshot, n)
    expect(q.exact).toBe(false)
    expect(q.palette.length / 4).toBe(n)
    const d = imageDifference(screenshot.data, reconstruct(q, screenshot.width, screenshot.height))
    expect(d.psnr).toBeGreaterThan(45)
    expect(d.wrong).toBe(0)
  })
  it('splits off a dominant colour that sorts last instead of leaving an empty box', () => {
    // 90% white (the maximum on every channel) plus a dark gradient: every median cut puts white at the far end
    const img = image(100, 100, (x, y) => (y < 90 ? [255, 255, 255, 255] : [x * 2, 40 + x, 200 - x, 255]))
    const q = quantize(img, 16)
    expect(q.palette.length / 4).toBe(16)
    expect(imageDifference(img.data, reconstruct(q, 100, 100)).wrong).toBe(0)
  })
  it('rejects a collapsed palette and heavy posterization, accepts a faithful reduction', () => {
    const flat = new Uint8Array(screenshot.data.length).fill(255) // what the 1-colour bug produced: almost all white
    expect(looksLikeSource(screenshot.data, flat)).toBe(false)
    const wheel = image(200, 200, (x, y) => { const h = Math.atan2(y - 100, x - 100) * 3, r = Math.hypot(x - 100, y - 100) / 142; return [0, 2, 4].map((k) => Math.round(255 * (0.15 + 0.7 * r) * (0.5 + 0.5 * Math.cos(h - k)))).concat(255) as [number, number, number, number] })
    expect(looksLikeSource(wheel.data, reconstruct(quantize(wheel, 16), 200, 200))).toBe(false)
    expect(looksLikeSource(wheel.data, reconstruct(quantize(wheel, 256), 200, 200))).toBe(true)
    expect(looksLikeSource(screenshot.data, reconstruct(quantize(screenshot, 128), screenshot.width, screenshot.height))).toBe(true)
  })
  it('ignores colour under full transparency', () => {
    expect(imageDifference([1, 2, 3, 0], [250, 250, 250, 0]).wrong).toBe(0)
    expect(imageDifference([1, 2, 3, 255], [250, 250, 250, 255]).wrong).toBe(1)
  })
})

import { imageDifference, looksLikeSource, pixelsMatch } from './validate-output'
describe('pixelsMatch', () => {
  it('requires opaque pixels to be exact', () => {
    expect(pixelsMatch([10, 20, 30, 255], [10, 20, 30, 255])).toBe(true)
    expect(pixelsMatch([10, 20, 30, 255], [10, 20, 31, 255])).toBe(false)
  })
  it('tolerates premultiplication rounding on low-alpha pixels only', () => {
    expect(pixelsMatch([200, 100, 50, 13], [195, 105, 55, 13])).toBe(true) // colour is mostly invisible at alpha 13
    expect(pixelsMatch([200, 100, 50, 200], [180, 100, 50, 200])).toBe(false)
  })
  it('ignores colour under full transparency but not an alpha change', () => {
    expect(pixelsMatch([1, 2, 3, 0], [9, 9, 9, 0])).toBe(true)
    expect(pixelsMatch([1, 2, 3, 0], [1, 2, 3, 40])).toBe(false)
  })
  it('rejects length mismatches', () => expect(pixelsMatch([0, 0, 0, 255], [])).toBe(false))
})
