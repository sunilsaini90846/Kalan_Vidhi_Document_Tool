import { readFileSync } from 'node:fs'
import { gzipSync } from 'fflate'
import { extractArchiveEntry, gunzipLimited, listArchive } from './archive'
import { ARCHIVE_LIMITS } from './limits'
import { parseTar } from './tar'

const fx = (n: string) => new Uint8Array(readFileSync(`fixtures/${n}`))
const lim = { ...ARCHIVE_LIMITS, maxEntryBytes: 1_000_000, maxTotalBytes: 2_000_000 }
const dec = (b: Uint8Array | null) => new TextDecoder().decode(b ?? new Uint8Array())

/** Minimal tar writer for crafting hostile archives (the real fixtures come from the system tar). */
function tarOf(entries: { name: string; data?: string; flag?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const e of entries) {
    const data = new TextEncoder().encode(e.data ?? '')
    const h = new Uint8Array(512)
    h.set(new TextEncoder().encode(e.name), 0)
    h.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0')), 124)
    h[156] = (e.flag ?? '0').charCodeAt(0)
    h.set(new TextEncoder().encode('ustar'), 257)
    h.fill(32, 148, 156)
    h.set(new TextEncoder().encode(h.reduce((s, v) => s + v, 0).toString(8).padStart(6, '0') + '\0 '), 148)
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((s, b) => s + b.length, 0)); let o = 0
  for (const b of blocks) { out.set(b, o); o += b.length }
  return out
}

describe('TAR (real fixtures from system tar)', () => {
  it('lists files and directories', () => {
    const names = listArchive(fx('sample.tar'), 'tar', 'sample.tar', lim).entries.map((e) => e.name).sort()
    expect(names).toEqual(['a.txt', 'dir/', 'dir/b.txt'])
  })
  it('extracts a file byte-for-byte', () => {
    expect(dec(extractArchiveEntry(fx('sample.tar'), 'tar', 'dir/b.txt', 'sample.tar', lim))).toBe('second file\n')
  })
  it('opens .tar.gz as a tar', () => {
    const r = listArchive(fx('sample.tar.gz'), 'gzip', 'sample.tar.gz', lim)
    expect(r.entries.map((e) => e.name)).toContain('dir/b.txt')
    expect(dec(extractArchiveEntry(fx('sample.tar.gz'), 'gzip', 'a.txt', 'sample.tar.gz', lim))).toBe('hello from tar\n')
  })
  it('treats a plain .gz as one file named without .gz', () => {
    const r = listArchive(fx('single.txt.gz'), 'gzip', 'single.txt.gz', lim)
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0]!.name).toBe('single.txt')
    expect(dec(extractArchiveEntry(fx('single.txt.gz'), 'gzip', 'single.txt', 'single.txt.gz', lim))).toBe('hello from tar\n')
  })
})

describe('TAR safety', () => {
  it('flags traversal paths and refuses to extract them', () => {
    const t = tarOf([{ name: '../../evil.sh', data: 'x' }, { name: 'ok.txt', data: 'fine' }])
    const e = listArchive(t, 'tar', 'x.tar', lim).entries
    expect(e.find((x) => x.name.includes('evil'))).toMatchObject({ unsafePath: true, extractable: false })
    expect(extractArchiveEntry(t, 'tar', '../../evil.sh', 'x.tar', lim)).toBeNull()
    expect(dec(extractArchiveEntry(t, 'tar', 'ok.txt', 'x.tar', lim))).toBe('fine')
  })
  it('lists symlinks but never extracts them', () => {
    const t = tarOf([{ name: 'link', flag: '2' }])
    expect(listArchive(t, 'tar', 'x.tar', lim).entries[0]).toMatchObject({ extractable: false, note: expect.stringContaining('never extracted') })
    expect(extractArchiveEntry(t, 'tar', 'link', 'x.tar', lim)).toBeNull()
  })
  it('rejects a corrupted header checksum', () => {
    const t = fx('sample.tar').slice(); t[0] = t[0]! ^ 0xff
    expect(() => parseTar(t, lim)).toThrow(/checksum/)
  })
  it('rejects truncated archives', () => expect(() => parseTar(fx('sample.tar').subarray(0, 700), lim)).toThrow(/truncated/))
  it('enforces the entry cap', () => {
    const t = tarOf(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, data: 'x' })))
    expect(() => parseTar(t, { ...lim, maxEntries: 5 })).toThrow(/entries/)
  })
  it('enforces the total size cap using declared sizes', () => {
    const t = tarOf([{ name: 'big', data: 'x'.repeat(3000) }])
    expect(() => parseTar(t, { ...lim, maxTotalBytes: 1000 })).toThrow(/safe size limit/)
  })
})

describe('GZIP safety', () => {
  it('stops a gzip bomb by counting inflated bytes', () => {
    const bomb = gzipSync(new Uint8Array(5_000_000))
    expect(bomb.length).toBeLessThan(10_000)
    expect(() => gunzipLimited(bomb, 1_000_000)).toThrow(/safe size limit/)
  })
  it('rejects truncated and garbage gzip', () => {
    expect(() => gunzipLimited(fx('single.txt.gz').subarray(0, 12), lim.maxTotalBytes)).toThrow(/damaged/)
    expect(() => gunzipLimited(new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), lim.maxTotalBytes)).toThrow()
  })
})
