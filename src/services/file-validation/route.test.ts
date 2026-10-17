import { routeFor } from './route'

describe('routeFor', () => {
  it('sends images to the compressor', () => expect(routeFor('png', 'a.png')).toBe('/image-compressor'))
  it('sends PDFs to the PDF compressor', () => expect(routeFor('pdf', 'a.pdf')).toBe('/pdf-compressor'))
  it('sends Office files to their optimizer', () => expect(routeFor('zip', 'Report.DOCX')).toBe('/docx-optimizer'))
  it('sends other zips to ZIP tools', () => expect(routeFor('zip', 'a.zip')).toBe('/zip-tools'))
  it('has no route for unknown content', () => { expect(routeFor('unknown', 'a.exe')).toBeNull(); expect(routeFor('gif', 'a.gif')).toBeNull() })
})
