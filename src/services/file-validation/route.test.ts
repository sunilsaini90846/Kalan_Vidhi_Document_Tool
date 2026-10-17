import { routeFor } from './route'

describe('routeFor', () => {
  it('sends GIF/BMP/TIFF/AVIF/SVG to the converter', () => { for (const k of ['gif', 'bmp', 'tiff', 'avif', 'svg', 'ico'] as const) expect(routeFor(k, `a.${k}`)).toBe('/image-converter') })
  it('routes OpenDocument and EPUB packages', () => { expect(routeFor('zip', 'a.odt')).toBe('/odf-optimizer'); expect(routeFor('zip', 'b.epub')).toBe('/epub-optimizer') })
  it('routes tar and gzip to ZIP tools', () => { expect(routeFor('tar', 'a.tar')).toBe('/zip-tools'); expect(routeFor('gzip', 'a.gz')).toBe('/zip-tools') })
  it('sends images to the compressor', () => expect(routeFor('png', 'a.png')).toBe('/image-compressor'))
  it('sends PDFs to the PDF compressor', () => expect(routeFor('pdf', 'a.pdf')).toBe('/pdf-compressor'))
  it('sends Office files to their optimizer', () => expect(routeFor('zip', 'Report.DOCX')).toBe('/docx-optimizer'))
  it('sends other zips to ZIP tools', () => expect(routeFor('zip', 'a.zip')).toBe('/zip-tools'))
  it('has no route for unknown content', () => { expect(routeFor('unknown', 'a.exe')).toBeNull(); expect(routeFor('heic', 'a.heic')).toBeNull(); expect(routeFor('mp4', 'a.mp4')).toBeNull() })
})
