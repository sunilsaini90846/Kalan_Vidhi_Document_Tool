import { strToU8, zipSync } from 'fflate'
import { inspectOffice, jpegComponents, describeMedia } from './inspect'
import { optimizeOffice, verifyPackage } from './optimize'
import { OFFICE } from './formats'

const types = (main: string, extra = '') => strToU8(`<?xml version="1.0"?><Types><Override PartName="/x" ContentType="application/vnd.${main}${extra}"/></Types>`)
const docx = (extra: Record<string, Uint8Array> = {}, ct = types('openxmlformats-officedocument.wordprocessingml.document.main+xml')) =>
  zipSync({ '[Content_Types].xml': ct, '_rels/.rels': strToU8('<r/>'), 'word/document.xml': strToU8('<doc>hello</doc>'), ...extra })

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const sof = (components: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, 0, 10, 0, 10, components, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('inspectOffice', () => {
  it('describes a valid DOCX and lists media', () => {
    const info = inspectOffice(docx({ 'word/media/a.png': png, 'word/media/b.emf': strToU8('emf') }), 'docx', 'a.docx')
    expect(info.parts).toBe(5)
    expect(info.media.map((m) => [m.name, m.kind])).toEqual([['word/media/a.png', 'png'], ['word/media/b.emf', 'other']])
  })
  it('rejects macro-enabled extensions', () => expect(() => inspectOffice(docx(), 'docx', 'a.docm')).toThrow(/Macro-enabled/))
  it('rejects packages containing VBA', () => expect(() => inspectOffice(docx({ 'word/vbaProject.bin': strToU8('x') }), 'docx', 'a.docx')).toThrow(/macros/))
  it('rejects macroEnabled content types', () => {
    expect(() => inspectOffice(docx({}, types('ms-word.document.macroEnabled.main+xml')), 'docx', 'a.docx')).toThrow()
  })
  it('rejects the wrong format', () => expect(() => inspectOffice(docx(), 'pptx', 'a.pptx')).toThrow(/valid PPTX/))
  it('rejects non-zip data', () => expect(() => inspectOffice(new Uint8Array(64), 'docx', 'a.docx')).toThrow())
  it('rejects zip-slip entries', () => {
    expect(() => inspectOffice(docx({ '../evil.xml': strToU8('x') }), 'docx', 'a.docx')).toThrow(/unsafe/)
  })
})

describe('media classification', () => {
  it('reads JPEG component counts', () => { expect(jpegComponents(sof(3))).toBe(3); expect(jpegComponents(sof(4))).toBe(4) })
  it('skips CMYK JPEG', () => expect(describeMedia('word/media/c.jpg', sof(4)).optimizable).toBe(false))
  it('optimizes RGB JPEG', () => expect(describeMedia('word/media/c.jpg', sof(3)).optimizable).toBe(true))
  it('skips a PNG disguised as .jpg', () => expect(describeMedia('word/media/c.jpg', png).optimizable).toBe(false))
})

describe('optimizeOffice without images', () => {
  it('keeps every part identical and reports no gain', async () => {
    const src = docx()
    const r = await optimizeOffice(src, 'docx', 'a.docx', 'balanced')
    expect(r.imagesFound).toBe(0)
    expect(r.imagesOptimized).toBe(0)
    expect(r.noGain).toBe(true)
  })
})

describe('verifyPackage', () => {
  const orig = [{ name: 'a', data: strToU8('1') }, { name: 'b', data: strToU8('2') }]
  const z = (o: Record<string, Uint8Array>) => zipSync(o)
  it('accepts identical content', () => expect(() => verifyPackage(orig, z({ a: strToU8('1'), b: strToU8('2') }), new Set())).not.toThrow())
  it('allows changes only to declared parts', () => {
    expect(() => verifyPackage(orig, z({ a: strToU8('1'), b: strToU8('X') }), new Set(['b']))).not.toThrow()
    expect(() => verifyPackage(orig, z({ a: strToU8('1'), b: strToU8('X') }), new Set())).toThrow(/validation/)
  })
  it('rejects missing or reordered parts', () => {
    expect(() => verifyPackage(orig, z({ a: strToU8('1') }), new Set())).toThrow()
    expect(() => verifyPackage(orig, z({ b: strToU8('2'), a: strToU8('1') }), new Set())).toThrow()
  })
  it('has format definitions for all formats', () => expect(Object.keys(OFFICE)).toEqual(['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp', 'epub']))
})
