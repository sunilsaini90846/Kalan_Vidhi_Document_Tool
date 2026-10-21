import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { BRAND, resolveSiteUrl, titleFor } from '@/config/brand'

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
  it('production origins: product on the doctool subdomain, parent on the bare domain', () => {
    expect(BRAND.siteUrl).toBe('https://doctool.kalanvidhi.com')
    expect(BRAND.parentUrl).toBe('https://kalanvidhi.com')
  })
  it('PDFs created by the app carry the brand as producer', () => {
    expect(BRAND.producer).toBe('Kalan Vidhi Doc Tool')
  })
})

describe('resolveSiteUrl (VITE_SITE_URL is an optional override)', () => {
  it('falls back to the production URL when unset or blank (GitHub passes "" for an unset variable)', () => {
    for (const v of [undefined, null, '', '   ']) expect(resolveSiteUrl(v)).toBe(BRAND.siteUrl)
  })
  it('accepts a bare origin override and drops a trailing slash', () => {
    expect(resolveSiteUrl('https://staging.example.com')).toBe('https://staging.example.com')
    expect(resolveSiteUrl('https://staging.example.com/')).toBe('https://staging.example.com')
    expect(resolveSiteUrl('http://localhost:4173')).toBe('http://localhost:4173')
  })
  it('rejects anything that is not a bare http(s) origin, so a typo fails the build instead of shipping bad canonicals', () => {
    for (const bad of ['doctool.kalanvidhi.com', 'https://doctool.kalanvidhi.com/app', 'https://doctool.kalanvidhi.com?x=1', 'ftp://example.com', 'https://user:pw@example.com', 'not a url'])
      expect(() => resolveSiteUrl(bad), bad).toThrow(/VITE_SITE_URL/)
  })
})
