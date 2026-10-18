import { expect, test } from '@playwright/test'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { fixtureBytes } from '../helpers'
import { dl, jpegFixture, stored, upload } from '../tool-kit'

function epub(extra: Zippable = {}, encryption?: string): Buffer {
  return Buffer.from(zipSync({
    mimetype: stored('application/epub+zip'), 'META-INF/container.xml': strToU8('<container/>'),
    ...(encryption ? { 'META-INF/encryption.xml': strToU8(encryption) } : {}),
    'OEBPS/content.opf': strToU8('<package/>'), 'OEBPS/ch1.xhtml': strToU8('<html><img src="images/cover.jpg"/></html>'), 'OEBPS/style.css': strToU8('body{}'), ...extra,
  }))
}
function firstEntry(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset); const n = v.getUint16(26, true)
  return { name: new TextDecoder().decode(zip.subarray(30, 30 + n)), method: v.getUint16(8, true), extra: v.getUint16(28, true) }
}
const optimize = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Optimize epub/i }).click()

test.describe('EPUB Optimizer', () => {
  test('page states accepted format and DRM exclusion', async ({ page }) => {
    await page.goto('/epub-optimizer')
    await expect(page.getByRole('heading', { level: 1, name: 'EPUB Optimizer' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('EPUB')
    await expect(page.getByText(/DRM-protected/)).toBeVisible()
  })

  test('finds images anywhere outside META-INF and optimizes JPEGs, leaving all other entries identical', async ({ page }) => {
    await page.goto('/epub-optimizer')
    const src = epub({ 'OEBPS/images/cover.jpg': jpegFixture(), 'OEBPS/images/fig.png': new Uint8Array(fixtureBytes('tiny-1x1.png')), 'OEBPS/fonts/f.otf': strToU8('font') })
    await upload(page, 'book.epub', src)
    await expect(page.getByText('2 embedded images')).toBeVisible()
    await page.getByLabel(/Strong/).check(); await optimize(page)
    await expect(page.getByText(/% smaller/)).toBeVisible()
    const out = await dl(page, /Download optimized/)
    expect(out.filename).toBe('book-optimized.epub')
    expect(firstEntry(out.bytes)).toEqual({ name: 'mimetype', method: 0, extra: 0 })
    const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.bytes)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    for (const n of Object.keys(before)) if (n !== 'OEBPS/images/cover.jpg') expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
    expect(after['OEBPS/images/cover.jpg']!.length).toBeLessThan(before['OEBPS/images/cover.jpg']!.length)
  })

  test('image-less and non-shrinkable books are reported honestly', async ({ page }) => {
    await page.goto('/epub-optimizer')
    await upload(page, 'text.epub', epub())
    await expect(page.getByText(/No embedded images were found/)).toBeVisible()
    await page.getByRole('button', { name: 'Choose another file' }).click()
    await upload(page, 'small.epub', epub({ 'OEBPS/images/s.jpg': new Uint8Array(fixtureBytes('photo-q30.jpg')) }))
    await page.getByLabel(/Light/).check(); await optimize(page)
    await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
  })

  test('font obfuscation entries are allowed; DRM on images is refused', async ({ page }) => {
    await page.goto('/epub-optimizer')
    const fontOnly = '<encryption><EncryptedData><CipherReference URI="OEBPS/fonts/f.otf"/></EncryptedData></encryption>'
    await upload(page, 'fonts.epub', epub({ 'OEBPS/images/c.jpg': jpegFixture() }, fontOnly))
    await expect(page.getByText('1 embedded image')).toBeVisible()
    await page.reload()
    const drm = '<encryption><EncryptedData><CipherReference URI="OEBPS/images/c.jpg"/></EncryptedData></encryption>'
    await upload(page, 'drm.epub', epub({ 'OEBPS/images/c.jpg': jpegFixture() }, drm))
    await expect(page.getByRole('alert')).toContainText('DRM')
  })

  test('rejects non-epub packages, wrong mimetype, wrong extension and damaged files', async ({ page }) => {
    await page.goto('/epub-optimizer')
    const reject = async (name: string, data: Uint8Array | Buffer, message: string | RegExp) => {
      await page.reload(); await upload(page, name, data)
      await expect(page.getByRole('alert')).toContainText(message)
    }
    await reject('a.odt', epub(), '.epub')
    await reject('wrong.epub', zipSync({ mimetype: stored('text/plain'), 'META-INF/container.xml': strToU8('x') }), 'valid EPUB')
    await reject('nomime.epub', zipSync({ 'META-INF/container.xml': strToU8('x') }), 'valid EPUB')
    await reject('cut.epub', epub().subarray(0, 100), /not a supported file type|not a valid ZIP|damaged/)
    await reject('fake.epub', Buffer.from('hello'), 'not a supported file type')
  })
})
