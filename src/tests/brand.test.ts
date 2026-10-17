import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { BRAND, titleFor } from '@/config/brand'

describe('brand', () => {
  it('uses Kalan Vidhi as the parent and Doc Tool as the product', () => {
    expect(BRAND).toMatchObject({ parent: 'Kalan Vidhi', product: 'Doc Tool', name: 'Kalan Vidhi Doc Tool' })
    expect(titleFor('Merge PDF')).toBe('Merge PDF | Kalan Vidhi Doc Tool')
  })
  it('the old product name is gone from every tracked file', () => {
    const old = new RegExp('File' + 'Squeeze', 'i')
    const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter((f) => f && !/\.(png|jpg|jpeg|webp|gif|bmp|tiff|avif|ico|tar|gz|lock)$|package-lock/.test(f) && !f.startsWith('fixtures/'))
    const offenders = files.filter((f) => { try { return old.test(readFileSync(f, 'utf8')) } catch { return false } })
    expect(offenders).toEqual([])
  })
  it('static HTML keeps the brand in title and social tags and parameterizes site URLs', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toMatch(/<title>Kalan Vidhi Doc Tool/)
    expect(html).toMatch(/og:site_name" content="Kalan Vidhi Doc Tool"/)
    expect(html.match(/__SITE_URL__/g)?.length).toBeGreaterThan(0)
  })
  it('PDFs created by the app carry the brand as producer', () => {
    expect(BRAND.producer).toBe('Kalan Vidhi Doc Tool')
  })
})
