import { expect, test } from '@playwright/test'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { fixtureBytes } from '../helpers'
import { dl, jpegFixture, stored, upload } from '../tool-kit'

const MIME = { odt: 'text', ods: 'spreadsheet', odp: 'presentation' } as const
type Ext = keyof typeof MIME

function odf(ext: Ext, extra: Zippable = {}, manifest = '<manifest:manifest/>'): Buffer {
  return Buffer.from(zipSync({
    mimetype: stored(`application/vnd.oasis.opendocument.${MIME[ext]}`),
    'META-INF/manifest.xml': strToU8(manifest), 'content.xml': strToU8('<office:document-content>cell =SUM(A1:A3)</office:document-content>'),
    'styles.xml': strToU8('<styles/>'), ...extra,
  }))
}
/** First local header: name, compression method, extra-field length. ODF requires mimetype first, stored, no extra field. */
function firstEntry(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset)
  const n = v.getUint16(26, true)
  return { name: new TextDecoder().decode(zip.subarray(30, 30 + n)), method: v.getUint16(8, true), extra: v.getUint16(28, true) }
}
const optimize = (page: import('@playwright/test').Page, ext: string) => page.getByRole('button', { name: new RegExp(`Optimize ${ext}`, 'i') }).click()

test.describe('ODF Optimizer (ODT, ODS, ODP)', () => {
  test('page names its three formats and what it will not do', async ({ page }) => {
    await page.goto('/odf-optimizer')
    await expect(page.getByRole('heading', { level: 1, name: 'ODF Optimizer' })).toBeVisible()
    await expect(page.getByText(/Accepted:/)).toContainText('ODT, ODS, ODP')
    await expect(page.getByText(/does not convert to PDF or between document formats/)).toBeVisible()
  })

  for (const ext of Object.keys(MIME) as Ext[]) {
    test(`${ext}: optimizes Pictures/, mimetype stays first/stored, all other parts identical`, async ({ page }) => {
      await page.goto('/odf-optimizer')
      const src = odf(ext, { 'Pictures/100.jpg': jpegFixture(), 'Pictures/logo.gif': strToU8('GIF89a-not-touched'), 'Thumbnails/thumbnail.png': new Uint8Array(fixtureBytes('tiny-1x1.png')) })
      await upload(page, `doc.${ext}`, src)
      await expect(page.getByText('2 embedded images')).toBeVisible() // thumbnail is not a document image
      await page.getByLabel(/Strong/).check(); await optimize(page, ext)
      await expect(page.getByText(/% smaller/)).toBeVisible()
      const out = await dl(page, /Download optimized/)
      expect(out.filename).toBe(`doc-optimized.${ext}`)
      expect(firstEntry(out.bytes)).toEqual({ name: 'mimetype', method: 0, extra: 0 })
      const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.bytes)
      expect(Object.keys(after)).toEqual(Object.keys(before))
      for (const n of Object.keys(before)) if (n !== 'Pictures/100.jpg') expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
      expect(after['Pictures/100.jpg']!.length).toBeLessThan(before['Pictures/100.jpg']!.length)
    })
  }

  test('no pictures: nothing to optimize; undersized pictures: honest no-reduction', async ({ page }) => {
    await page.goto('/odf-optimizer')
    await upload(page, 'plain.odt', odf('odt'))
    await expect(page.getByText(/No embedded images were found/)).toBeVisible()
    await page.getByRole('button', { name: 'Choose another file' }).click()
    await upload(page, 'small.odt', odf('odt', { 'Pictures/s.jpg': new Uint8Array(fixtureBytes('photo-q30.jpg')) }))
    await page.getByLabel(/Light/).check(); await optimize(page, 'odt')
    await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Download optimized/ })).toHaveCount(0)
  })

  test('rejects: other extensions, wrong mimetype, mimetype not first, macros, encryption, truncated archives', async ({ page }) => {
    await page.goto('/odf-optimizer')
    const reject = async (name: string, data: Uint8Array | Buffer, message: string | RegExp) => {
      await page.reload(); await upload(page, name, data)
      await expect(page.getByRole('alert')).toContainText(message)
    }
    await reject('a.docx', odf('odt'), '.odt / .ods / .odp')
    await reject('wrong.odt', odf('ods'), 'valid ODT')
    await reject('order.odt', zipSync({ 'content.xml': strToU8('x'), mimetype: stored('application/vnd.oasis.opendocument.text'), 'META-INF/manifest.xml': strToU8('x') }), 'valid ODT')
    await reject('macro.odt', odf('odt', { 'Basic/Standard/Module1.xml': strToU8('Sub Main') }), 'macros')
    await reject('scripts.ods', odf('ods', { 'Scripts/python/x.py': strToU8('print(1)') }), 'macros')
    await reject('secret.odt', odf('odt', {}, '<manifest><encryption-data/></manifest>'), 'password-protected')
    await reject('cut.odp', odf('odp').subarray(0, 120), /not a supported file type|not a valid ZIP|damaged/)
  })
})
