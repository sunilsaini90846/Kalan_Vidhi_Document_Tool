import { readFileSync } from 'node:fs'
import { assertSafeSvg, parseSvgSize, svgRenderSize, SVG_MAX_SIDE } from './svg'

const svg = (body: string, attrs = 'xmlns="http://www.w3.org/2000/svg" width="10" height="10"') => `<svg ${attrs}>${body}</svg>`

describe('assertSafeSvg', () => {
  it('accepts the genuine fixture', () => expect(() => assertSafeSvg(readFileSync('fixtures/logo.svg', 'utf8'), 'logo.svg')).not.toThrow())
  it('rejects the malicious fixture', () => expect(() => assertSafeSvg(readFileSync('fixtures/malicious.svg', 'utf8'), 'm.svg')).toThrow(/script/))
  it.each([
    ['script', svg('<script>alert(1)</script>')], ['foreignObject', svg('<foreignObject><div/></foreignObject>')],
    ['handler', svg('<rect onload="x()"/>')], ['entity', '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'],
    ['javascript url', svg('<a href="javascript:alert(1)"><rect/></a>')], ['external image', svg('<image href="https://evil.example/a.png"/>')],
    ['external xlink', svg('<use xlink:href="http://evil.example/a.svg#x"/>')], ['css url', svg('<rect style="fill:url(https://evil.example/x)"/>')],
    ['css import', svg('<style>@import url(x.css);</style>')], ['iframe', svg('<iframe src="x"/>')],
  ])('rejects %s', (_n, doc) => expect(() => assertSafeSvg(doc, 'x.svg')).toThrow(/rejected|not opened/))
  it('allows internal references and embedded raster data', () => {
    expect(() => assertSafeSvg(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/><image href="data:image/png;base64,AAAA"/>'), 'x.svg')).not.toThrow()
  })
})

describe('svg sizing', () => {
  it('reads width/height, with px', () => expect(parseSvgSize(svg('', 'xmlns="http://www.w3.org/2000/svg" width="200px" height="100"'), 'x')).toEqual({ width: 200, height: 100 }))
  it('falls back to viewBox', () => expect(parseSvgSize(svg('', 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"'), 'x')).toEqual({ width: 30, height: 20 }))
  it('returns null with no size', () => expect(parseSvgSize(svg('', 'xmlns="http://www.w3.org/2000/svg"'), 'x')).toBeNull())
  it('rejects malformed XML', () => expect(() => parseSvgSize('<svg><rect></svg>', 'x')).toThrow(/not valid SVG/))
  it('scales vectors up to the requested box, keeping aspect ratio', () => expect(svgRenderSize({ width: 200, height: 100 }, { maxWidth: 800 })).toEqual({ width: 800, height: 400 }))
  it('caps absurd sizes', () => {
    const r = svgRenderSize({ width: 100, height: 100 }, { maxWidth: 100000 })
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(SVG_MAX_SIDE)
  })
  it('uses natural size without a box', () => expect(svgRenderSize({ width: 33, height: 22 }, {})).toEqual({ width: 33, height: 22 }))
})
