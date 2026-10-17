import { zipSync, strToU8 } from 'fflate'
import { ARCHIVE_LIMITS } from './limits'
import { isUnsafePath, listZipEntries } from './zipDirectory'
import { readZip } from './zipRead'
import { createZip } from './zipCreate'

const lim = { ...ARCHIVE_LIMITS, maxEntryBytes: 1_000_000, maxTotalBytes: 2_000_000 }
const sample = () => zipSync({ 'a.txt': strToU8('hello'), 'dir/b.txt': strToU8('world') })

describe('isUnsafePath', () => {
  it.each(['../x', 'a/../../x', '/etc/passwd', 'C:\\x', '..\\x', 'a\0b'])('flags %j', (p) => expect(isUnsafePath(p)).toBe(true))
  it.each(['a.txt', 'dir/b.txt', 'a..b/c', '.hidden'])('allows %j', (p) => expect(isUnsafePath(p)).toBe(false))
})

describe('zip reading', () => {
  it('lists entries without inflating', () => {
    expect(listZipEntries(sample()).map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt'])
  })
  it('reads entries back', () => {
    const r = readZip(sample(), lim)
    expect(r.map((f) => f.name)).toEqual(['a.txt', 'dir/b.txt'])
    expect(new TextDecoder().decode(r[1]!.data)).toBe('world')
  })
  it('filters entries', () => expect(readZip(sample(), lim, (n) => n === 'a.txt')).toHaveLength(1))
  it('rejects garbage', () => expect(() => readZip(new Uint8Array(100), lim)).toThrow(/not a valid ZIP/))
  it('rejects zip-slip paths', () => {
    expect(() => readZip(zipSync({ '../evil.txt': strToU8('x') }), lim)).toThrow(/unsafe file path/)
  })
  it('stops a zip bomb (declared sizes honest) by directory check', () => {
    const bomb = zipSync({ 'zeros.bin': new Uint8Array(5_000_000) })
    expect(bomb.length).toBeLessThan(20_000)
    expect(() => readZip(bomb, lim)).toThrow(/limit/)
  })
  it('stops a zip bomb whose headers lie about size', () => {
    const bomb = zipSync({ 'zeros.bin': new Uint8Array(5_000_000) })
    const v = new DataView(bomb.buffer, bomb.byteOffset)
    // Falsify the uncompressed size in the central directory and local header.
    const cd = v.getUint32(bomb.length - 22 + 16, true)
    v.setUint32(cd + 24, 100, true)
    v.setUint32(22, 100, true)
    expect(() => readZip(bomb, lim)).toThrow(/safe size limit/)
  })
  it('detects encrypted entries from the directory', () => {
    const z = sample(); const v = new DataView(z.buffer, z.byteOffset)
    const cd = v.getUint32(z.length - 22 + 16, true)
    v.setUint16(cd + 8, v.getUint16(cd + 8, true) | 1, true)
    expect(listZipEntries(z)[0]!.encrypted).toBe(true)
    expect(() => readZip(z, lim)).toThrow(/password/)
  })
})

describe('zip creation', () => {
  it('round-trips and dedupes names', () => {
    const z = createZip([{ name: 'a.txt', data: strToU8('1') }, { name: 'a.txt', data: strToU8('2') }])
    expect(readZip(z, lim).map((f) => f.name)).toEqual(['a.txt', 'a (2).txt'])
  })
  it('neutralises path characters in names', () => {
    expect(readZip(createZip([{ name: '../x.txt', data: strToU8('1') }]), lim)[0]!.name).not.toContain('..')
  })
  it('keeps directory paths when repacking validated archives', () => {
    const z = createZip([{ name: 'word/document.xml', data: strToU8('1') }], 'auto', true)
    expect(readZip(z, lim)[0]!.name).toBe('word/document.xml')
  })
  it('requires files', () => expect(() => createZip([])).toThrow())
})
