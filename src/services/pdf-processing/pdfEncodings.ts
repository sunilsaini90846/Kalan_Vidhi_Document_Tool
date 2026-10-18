import { unzlibSync } from 'fflate'

/** ASCII85 (Adobe variant) as used by PDF's ASCII85Decode. Returns null on malformed input. */
export function decodeAscii85(data: Uint8Array): Uint8Array | null {
  let s = new TextDecoder('latin1').decode(data)
  s = s.replace(/^\s*<~/, '')
  const end = s.indexOf('~>')
  if (end >= 0) s = s.slice(0, end)
  const out: number[] = []
  let group: number[] = []
  const flush = (n: number) => {
    let v = 0
    for (let i = 0; i < 5; i++) v = v * 85 + (group[i] ?? 84)
    if (v > 0xffffffff) throw new Error('overflow')
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
    out.push(...bytes.slice(0, n)); group = []
  }
  try {
    for (const ch of s) {
      const c = ch.charCodeAt(0)
      if (c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0) continue
      if (ch === 'z' && group.length === 0) { out.push(0, 0, 0, 0); continue }
      if (c < 33 || c > 117) return null
      group.push(c - 33)
      if (group.length === 5) flush(4)
    }
    if (group.length === 1) return null
    if (group.length > 1) flush(group.length - 1)
  } catch { return null }
  return Uint8Array.from(out)
}

export function decodeAsciiHex(data: Uint8Array): Uint8Array | null {
  const s = new TextDecoder('latin1').decode(data).replace(/>.*$/s, '').replace(/\s+/g, '')
  if (!/^[0-9a-fA-F]*$/.test(s)) return null
  const t = s.length % 2 ? s + '0' : s
  return Uint8Array.from({ length: t.length / 2 }, (_, i) => parseInt(t.slice(i * 2, i * 2 + 2), 16))
}

export function decodeFlate(data: Uint8Array): Uint8Array | null {
  try { return unzlibSync(data) } catch { return null }
}

/** Reverses PDF stream filters that only wrap bytes (no predictors), in order. Returns null if any step is unsupported or fails. */
export function unwrapFilters(names: string[], data: Uint8Array): Uint8Array | null {
  let cur: Uint8Array | null = data
  for (const n of names) {
    if (!cur) return null
    cur = n === 'ASCII85Decode' ? decodeAscii85(cur) : n === 'ASCIIHexDecode' ? decodeAsciiHex(cur) : n === 'FlateDecode' ? decodeFlate(cur) : null
  }
  return cur
}
