import { readFileSync } from 'node:fs'
import { TOOLS } from '@/tools/registry'
import { formatsMarkdown } from './markdown'
import { FORMATS, TOOL_ACCEPTS, explainUnsupported, formatByKind, getFormat } from './registry'

describe('format registry', () => {
  it('has unique ids', () => expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length))
  it('every supported format names at least one real, available tool', () => {
    const slugs = new Set(TOOLS.filter((t) => t.status === 'available').map((t) => t.slug))
    for (const f of FORMATS.filter((x) => x.level === 'supported')) {
      expect(f.tools.length, f.id).toBeGreaterThan(0)
      for (const t of f.tools) expect(slugs.has(t), `${f.id} -> ${t}`).toBe(true)
    }
  })
  it('unsupported formats claim no tools or operations', () => {
    for (const f of FORMATS.filter((x) => x.level !== 'supported')) {
      expect([f.id, f.tools, f.compressible, f.mergeable, f.extractable, f.convertibleTo]).toEqual([f.id, [], false, false, false, []])
    }
  })
  it('never lists a format as convertible to something not in the registry', () => {
    for (const f of FORMATS) for (const o of f.convertibleTo) expect(getFormat(o), `${f.id} -> ${o}`).toBeDefined()
  })
  it('does not advertise AVIF/GIF/SVG as compressible-in-place', () => {
    for (const id of ['avif', 'gif', 'svg', 'bmp', 'tiff', 'ico', 'apng']) expect(getFormat(id)!.compressible).toBe(false)
  })
  it('tool accept lists only contain formats that name that tool', () => {
    for (const [tool, kinds] of Object.entries(TOOL_ACCEPTS)) for (const k of kinds) {
      expect(formatByKind(k)!.tools, `${tool} accepts ${k}`).toContain(tool)
    }
  })
  it('explains recognised formats and stays silent for unknown ones', () => {
    expect(explainUnsupported('heic', 'a.heic')).toMatch(/not supported yet/)
    expect(explainUnsupported('gif', 'a.gif', TOOL_ACCEPTS['image-compressor'])).toMatch(/Image Converter/)
    expect(explainUnsupported('unknown', 'a.bin')).toBeNull()
  })
  it('does not call text-like content a TXT file when the name says otherwise', () => {
    expect(explainUnsupported('text', 'fake.pdf', ['pdf'])).toMatch(/not a supported file type for this tool.*plain text, not PDF/)
    expect(explainUnsupported('text', 'x.exe')).toMatch(/is not supported: its contents look like plain text/)
    expect(explainUnsupported('text', 'notes.txt')).toMatch(/Plain text files/)
  })
  it('docs/FORMATS.md is exactly what the registry generates (run `npm run docs:formats`)', () => {
    expect(readFileSync('docs/FORMATS.md', 'utf8')).toBe(formatsMarkdown() + '\n')
  })
})
