import { zlibSync } from 'fflate'
import { crc32 } from '@/services/archive-processing/crc32'

/** Pixel data is RGBA, 8 bits per channel, row-major (what canvas getImageData returns). */
export interface Rgba { data: Uint8ClampedArray | Uint8Array; width: number; height: number }


function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** PNG scanline filtering: choose, per row, the filter with the smallest sum of absolute residuals. */
function filterRows(raw: Uint8Array, rowBytes: number, rows: number, bpp: number): Uint8Array {
  const out = new Uint8Array((rowBytes + 1) * rows)
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes))
  for (let y = 0; y < rows; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes)
    const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : null
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0, b = prev ? prev[i]! : 0, c = prev && i >= bpp ? prev[i - bpp]! : 0
      const x = row[i]!
      cand[0]![i] = x
      cand[1]![i] = (x - a) & 255
      cand[2]![i] = (x - b) & 255
      cand[3]![i] = (x - ((a + b) >> 1)) & 255
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      cand[4]![i] = (x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
    }
    let best = 0, bestSum = Infinity
    for (let f = 0; f < 5; f++) { let s = 0; const r = cand[f]!; for (let i = 0; i < rowBytes; i++) { const v = r[i]!; s += v < 128 ? v : 256 - v }; if (s < bestSum) { bestSum = s; best = f } }
    out[y * (rowBytes + 1)] = best
    out.set(cand[best]!, y * (rowBytes + 1) + 1)
  }
  return out
}

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

function assemble(width: number, height: number, depth: number, colorType: number, idat: Uint8Array, extra: Uint8Array[] = []): Uint8Array {
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, width); v.setUint32(4, height); ihdr[8] = depth; ihdr[9] = colorType
  const parts = [SIGNATURE, chunk('IHDR', ihdr), ...extra, chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** Lossless truecolor PNG: RGB when fully opaque, RGBA otherwise. Exact for the given pixels. */
export function encodePngTruecolor({ data, width, height }: Rgba): Uint8Array {
  let opaque = true
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break }
  const ch = opaque ? 3 : 4
  const raw = new Uint8Array(width * height * ch)
  if (opaque) for (let i = 0, j = 0; i < data.length; i += 4) { raw[j++] = data[i]!; raw[j++] = data[i + 1]!; raw[j++] = data[i + 2]! }
  else raw.set(data)
  return assemble(width, height, 8, opaque ? 2 : 6, zlibSync(filterRows(raw, width * ch, height, ch), { level: 9 }))
}

export interface Quantized { palette: Uint8Array /* RGBA * n */; indices: Uint8Array; exact: boolean }

/**
 * Reduces an image to at most `maxColors` colours (RGBA). If it already has no more distinct colours the
 * result is exact (lossless); otherwise median-cut on a 5/5/5/4-bit histogram, nearest-colour mapping, no dithering.
 */
export function quantize({ data, width, height }: Rgba, maxColors: number): Quantized {
  const n = width * height
  const exact = new Map<number, number>()
  const exactIdx = new Uint8Array(n)
  const exactPal: number[] = []
  let overflow = false
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = data[o + 3]!
    const key = a === 0 ? 0 : (((data[o]! << 24) | (data[o + 1]! << 16) | (data[o + 2]! << 8) | a) >>> 0) + 1
    let idx = exact.get(key)
    if (idx === undefined) {
      if (exact.size >= maxColors) { overflow = true; break }
      idx = exact.size; exact.set(key, idx); exactPal.push(a === 0 ? 0 : data[o]!, a === 0 ? 0 : data[o + 1]!, a === 0 ? 0 : data[o + 2]!, a)
    }
    exactIdx[i] = idx
  }
  if (!overflow) return { palette: Uint8Array.from(exactPal), indices: exactIdx, exact: true }

  const BINS = 1 << 19
  const count = new Uint32Array(BINS), sr = new Float64Array(BINS), sg = new Float64Array(BINS), sb = new Float64Array(BINS), sa = new Float64Array(BINS)
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = data[o + 3]!
    const r = a === 0 ? 0 : data[o]!, g = a === 0 ? 0 : data[o + 1]!, b = a === 0 ? 0 : data[o + 2]!
    const bin = ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4)
    count[bin]!++; sr[bin]! += r; sg[bin]! += g; sb[bin]! += b; sa[bin]! += a
  }
  const used: number[] = []
  for (let b = 0; b < BINS; b++) if (count[b]) used.push(b)
  const mean = (b: number) => { const c = count[b]!; return [sr[b]! / c, sg[b]! / c, sb[b]! / c, sa[b]! / c] as const }

  interface Box { bins: number[]; total: number }
  const range = (bx: Box) => {
    const lo = [255, 255, 255, 255], hi = [0, 0, 0, 0]
    for (const b of bx.bins) { const m = mean(b); for (let c = 0; c < 4; c++) { if (m[c]! < lo[c]!) lo[c] = m[c]!; if (m[c]! > hi[c]!) hi[c] = m[c]! } }
    let ch = 0, best = -1
    for (let c = 0; c < 4; c++) { const r = (hi[c]! - lo[c]!) * (c === 3 ? 1.2 : 1); if (r > best) { best = r; ch = c } }
    return { channel: ch, spread: best }
  }
  let boxes: Box[] = [{ bins: used, total: n }]
  while (boxes.length < maxColors) {
    let pick = -1, bestScore = 0, pickCh = 0
    boxes.forEach((bx, i) => { if (bx.bins.length < 2) return; const r = range(bx); const score = r.spread * Math.sqrt(bx.total); if (score > bestScore) { bestScore = score; pick = i; pickCh = r.channel } })
    if (pick < 0) break
    const bx = boxes[pick]!
    const sorted = [...bx.bins].sort((x, y) => mean(x)[pickCh]! - mean(y)[pickCh]!)
    let acc = 0, cut = 0
    for (; cut < sorted.length - 1; cut++) { acc += count[sorted[cut]!]!; if (acc >= bx.total / 2) break }
    const left = sorted.slice(0, cut + 1), right = sorted.slice(cut + 1)
    const sum = (bins: number[]) => bins.reduce((s, b) => s + count[b]!, 0)
    boxes.splice(pick, 1, { bins: left, total: sum(left) }, { bins: right, total: sum(right) })
  }
  boxes = boxes.filter((b) => b.bins.length)
  const palette = new Uint8Array(boxes.length * 4)
  boxes.forEach((bx, i) => {
    let r = 0, g = 0, b = 0, a = 0, t = 0
    for (const bin of bx.bins) { r += sr[bin]!; g += sg[bin]!; b += sb[bin]!; a += sa[bin]!; t += count[bin]! }
    const alpha = Math.round(a / t)
    palette.set(alpha === 0 ? [0, 0, 0, 0] : [Math.round(r / t), Math.round(g / t), Math.round(b / t), alpha], i * 4)
  })
  const binToIdx = new Uint8Array(BINS)
  for (const bin of used) {
    const m = mean(bin); let best = 0, bd = Infinity
    for (let p = 0; p < boxes.length; p++) {
      const dr = m[0] - palette[p * 4]!, dg = m[1] - palette[p * 4 + 1]!, db = m[2] - palette[p * 4 + 2]!, da = m[3] - palette[p * 4 + 3]!
      const d = dr * dr + dg * dg + db * db + 2 * da * da
      if (d < bd) { bd = d; best = p }
    }
    binToIdx[bin] = best
  }
  const indices = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = data[o + 3]!
    const r = a === 0 ? 0 : data[o]!, g = a === 0 ? 0 : data[o + 1]!, b = a === 0 ? 0 : data[o + 2]!
    indices[i] = binToIdx[((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4)]!
  }
  return { palette, indices, exact: false }
}

/** Indexed-colour PNG (1/2/4/8-bit by palette size) with tRNS for transparent entries. */
export function encodePngIndexed(q: Quantized, width: number, height: number): Uint8Array {
  const n = q.palette.length / 4
  const depth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8
  const perByte = 8 / depth
  const rowBytes = Math.ceil((width * depth) / 8)
  const raw = new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = q.indices[y * width + x]!
    raw[y * rowBytes + Math.floor(x / perByte)]! |= v << (8 - depth - (x % perByte) * depth)
  }
  const plte = new Uint8Array(n * 3)
  let lastAlpha = -1
  for (let i = 0; i < n; i++) { plte.set(q.palette.subarray(i * 4, i * 4 + 3), i * 3); if (q.palette[i * 4 + 3] !== 255) lastAlpha = i }
  const extra = [chunk('PLTE', plte)]
  if (lastAlpha >= 0) extra.push(chunk('tRNS', Uint8Array.from({ length: lastAlpha + 1 }, (_, i) => q.palette[i * 4 + 3]!)))
  return assemble(width, height, depth, 3, zlibSync(filterRows(raw, rowBytes, height, 1), { level: 9 }), extra)
}

/** The RGBA pixels an indexed result decodes to; used to validate the encoder's output. */
export function reconstruct(q: Quantized, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) out.set(q.palette.subarray(q.indices[i]! * 4, q.indices[i]! * 4 + 4), i * 4)
  return out
}
