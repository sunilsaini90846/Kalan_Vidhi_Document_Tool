import { strToU8, zipSync, type Zippable } from 'fflate'
import { listZipEntries } from '@/services/archive-processing/zipDirectory'
import { ARCHIVE_LIMITS } from '@/services/archive-processing/limits'
import { OFFICE, formatFromName } from './formats'
import { inspectOffice } from './inspect'
import { optimizeOffice } from './optimize'

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const stored = (s: string): [Uint8Array, { level: 0 }] => [strToU8(s), { level: 0 }]

function odf(kind: 'text' | 'spreadsheet' | 'presentation', extra: Zippable = {}, manifest = '<manifest/>'): Uint8Array {
  return zipSync({
    mimetype: stored(`application/vnd.oasis.opendocument.${kind}`),
    'META-INF/manifest.xml': strToU8(manifest), 'content.xml': strToU8('<office:document-content>hello =SUM(A1)</office:document-content>'), ...extra,
  })
}
function epub(extra: Zippable = {}, encryption?: string): Uint8Array {
  return zipSync({
    mimetype: stored('application/epub+zip'), 'META-INF/container.xml': strToU8('<container/>'),
    ...(encryption ? { 'META-INF/encryption.xml': strToU8(encryption) } : {}),
    'OEBPS/content.opf': strToU8('<package/>'), ...extra,
  })
}

describe('ODF packages', () => {
  it.each([['odt', 'text'], ['ods', 'spreadsheet'], ['odp', 'presentation']] as const)('accepts a valid %s', (f, kind) => {
    expect(inspectOffice(odf(kind), f, `a.${f}`).parts).toBe(3)
  })
  it('lists Pictures/ images and ignores other files', () => {
    const info = inspectOffice(odf('text', { 'Pictures/a.png': png, 'Thumbnails/thumbnail.png': png }), 'odt', 'a.odt')
    expect(info.media.map((m) => m.name)).toEqual(['Pictures/a.png'])
  })
  it('rejects the wrong mimetype for the extension', () => expect(() => inspectOffice(odf('spreadsheet'), 'odt', 'a.odt')).toThrow(/valid ODT/))
  it('rejects a package whose mimetype is not first', () => {
    const z = zipSync({ 'content.xml': strToU8('x'), mimetype: stored('application/vnd.oasis.opendocument.text'), 'META-INF/manifest.xml': strToU8('x') })
    expect(() => inspectOffice(z, 'odt', 'a.odt')).toThrow(/valid ODT/)
  })
  it('rejects macros/scripts and encryption', () => {
    expect(() => inspectOffice(odf('text', { 'Basic/Standard/Module1.xml': strToU8('x') }), 'odt', 'a.odt')).toThrow(/macros/)
    expect(() => inspectOffice(odf('text', {}, '<manifest><encryption-data/></manifest>'), 'odt', 'a.odt')).toThrow(/password-protected/)
  })
  it('keeps mimetype first, stored and uncompressed when repacking', async () => {
    const src = odf('text', { 'Pictures/x.bin': png })
    const r = await optimizeOffice(src, 'odt', 'a.odt', 'balanced')
    const dir = listZipEntries(r.bytes, ARCHIVE_LIMITS)
    expect(dir[0]).toMatchObject({ name: 'mimetype', method: 0 })
    expect(dir.map((e) => e.name)).toEqual(listZipEntries(src, ARCHIVE_LIMITS).map((e) => e.name))
    // ODF requires no extra field in the mimetype local header
    const v = new DataView(r.bytes.buffer, r.bytes.byteOffset)
    expect(v.getUint16(28, true)).toBe(0)
  })
})

describe('EPUB packages', () => {
  it('accepts a valid epub and finds images anywhere outside META-INF', () => {
    const info = inspectOffice(epub({ 'OEBPS/images/c.png': png, 'OEBPS/style.css': strToU8('x') }), 'epub', 'b.epub')
    expect(info.media.map((m) => m.name)).toEqual(['OEBPS/images/c.png'])
  })
  it('rejects non-epub packages and a wrong mimetype', () => {
    expect(() => inspectOffice(odf('text'), 'epub', 'b.epub')).toThrow(/valid EPUB/)
    expect(() => inspectOffice(zipSync({ mimetype: stored('text/plain'), 'META-INF/container.xml': strToU8('x') }), 'epub', 'b.epub')).toThrow(/valid EPUB/)
  })
  it('allows font obfuscation entries but rejects DRM on images', () => {
    const fontOnly = '<encryption><EncryptedData><CipherReference URI="OEBPS/f.otf"/></EncryptedData></encryption>'
    expect(() => inspectOffice(epub({ 'OEBPS/c.png': png }, fontOnly), 'epub', 'b.epub')).not.toThrow()
    const drm = '<encryption><EncryptedData><CipherReference URI="OEBPS/c.png"/></EncryptedData></encryption>'
    expect(() => inspectOffice(epub({ 'OEBPS/c.png': png }, drm), 'epub', 'b.epub')).toThrow(/DRM/)
  })
})

describe('format lookup', () => {
  it('maps names to allowed formats only', () => {
    expect(formatFromName('Doc.ODS', ['odt', 'ods', 'odp'])).toBe('ods')
    expect(formatFromName('a.docx', ['odt', 'ods', 'odp'])).toBeNull()
    expect(formatFromName('noext', ['epub'])).toBeNull()
  })
  it('every format has a mime type and a media rule', () => {
    for (const d of Object.values(OFFICE)) { expect(d.mime).toMatch(/\//); expect(typeof d.isMedia).toBe('function') }
  })
})
