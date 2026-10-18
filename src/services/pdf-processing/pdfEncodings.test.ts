import { readFileSync } from 'node:fs'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { zlibSync as zlib } from 'fflate'
import { decodeAscii85, decodeAsciiHex, unwrapFilters } from './pdfEncodings'

const bytes = (s: string) => new TextEncoder().encode(s)
/** Reference encoder, to prove the decoder against an independent implementation. */
function encodeAscii85(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i += 4) {
    const chunk = data.subarray(i, i + 4), n = chunk.length
    let v = 0; for (let j = 0; j < 4; j++) v = v * 256 + (chunk[j] ?? 0)
    if (n === 4 && v === 0) { out += 'z'; continue }
    const digits: number[] = []; for (let j = 0; j < 5; j++) { digits.unshift(v % 85); v = Math.floor(v / 85) }
    out += digits.slice(0, n + 1).map((d) => String.fromCharCode(d + 33)).join('')
  }
  return out + '~>'
}

describe('ASCII85', () => {
  it('matches the known vector', () => expect(new TextDecoder().decode(decodeAscii85(bytes('87cURDZ~>'))!)).toBe('Hello'))
  it('round-trips arbitrary bytes of every length, including zero runs', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 7, 8, 100, 1001]) {
      const data = Uint8Array.from({ length: len }, (_, i) => (i % 7 === 0 ? 0 : (i * 37) & 255))
      expect(Array.from(decodeAscii85(bytes(encodeAscii85(data)))!), `len ${len}`).toEqual(Array.from(data))
    }
  })
  it('tolerates whitespace, the <~ prefix and missing terminator', () => expect(new TextDecoder().decode(decodeAscii85(bytes('<~87cU\n RDZ'))!)).toBe('Hello'))
  it('rejects illegal characters and impossible groups', () => {
    expect(decodeAscii85(bytes('87c{RDZ~>'))).toBeNull()
    expect(decodeAscii85(bytes('uuuuu~>'))).toBeNull() // overflows 32 bits
    expect(decodeAscii85(bytes('8~>'))).toBeNull() // a lone trailing digit is invalid
  })
})

describe('other wrappers', () => {
  it('ASCIIHex decodes, pads odd length, and rejects junk', () => {
    expect(Array.from(decodeAsciiHex(bytes('48 65 6C6C 6F>'))!)).toEqual(Array.from(bytes('Hello')))
    expect(Array.from(decodeAsciiHex(bytes('4>'))!)).toEqual([0x40])
    expect(decodeAsciiHex(bytes('zz'))).toBeNull()
  })
  it('unwrapFilters applies a chain in order and fails safely', () => {
    const payload = bytes('chain test '.repeat(20))
    const wrapped = bytes(encodeAscii85(zlib(payload)))
    expect(Array.from(unwrapFilters(['ASCII85Decode', 'FlateDecode'], wrapped)!)).toEqual(Array.from(payload)) // reportlab-style chain order
    expect(unwrapFilters(['FlateDecode'], bytes('not zlib'))).toBeNull()
    expect(unwrapFilters(['LZWDecode'], payload)).toBeNull()
  })
})

describe('genuine reportlab PDF (third-party producer)', () => {
  it('embeds its JPEG as [ASCII85Decode, DCTDecode], the case the compressor must handle', async () => {
    const doc = await PDFDocument.load(new Uint8Array(readFileSync('fixtures/reportlab-jpeg.pdf')))
    const imgs = doc.context.enumerateIndirectObjects().map(([, o]) => o).filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image'))
    expect(imgs).toHaveLength(1)
    const f = imgs[0]!.dict.lookup(PDFName.of('Filter')) as PDFArray
    expect([f.lookup(0), f.lookup(1)]).toEqual([PDFName.of('ASCII85Decode'), PDFName.of('DCTDecode')])
    const jpeg = unwrapFilters(['ASCII85Decode'], imgs[0]!.contents)!
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]) // really a JPEG once unwrapped
    expect(Buffer.from(jpeg).equals(readFileSync('fixtures/photo-q95.jpg'))).toBe(true) // byte-identical to what was embedded
  })
})
