import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { fixtureBytes } from './helpers'

const input = (page: Page) => page.locator('input[type=file]').first()
async function download(page: Page, click: () => Promise<void>) {
  const p = page.waitForEvent('download'); await click(); const d = await p
  return { name: d.suggestedFilename(), data: new Uint8Array(readFileSync(await d.path())) }
}
const noisyJpeg = () => new Uint8Array(fixtureBytes('photo-q95.jpg')) // a real 400x300 JPEG made at quality 95
const stored = (s: string): [Uint8Array, { level: 0 }] => [strToU8(s), { level: 0 }]
const upload = (name: string, data: Uint8Array) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(data) })

/** Reads the first local-header: name, compression method and extra-field length. */
function firstEntry(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset)
  const nameLen = v.getUint16(26, true)
  return { name: new TextDecoder().decode(zip.subarray(30, 30 + nameLen)), method: v.getUint16(8, true), extra: v.getUint16(28, true) }
}

const ODF: Record<string, string> = { odt: 'text', ods: 'spreadsheet', odp: 'presentation' }
for (const ext of Object.keys(ODF)) {
  test(`${ext}: optimizes Pictures/ images, keeps mimetype first and stored, everything else identical`, async ({ page }) => {
    await page.goto('/odf-optimizer')
    const files: Zippable = {
      mimetype: stored(`application/vnd.oasis.opendocument.${ODF[ext]}`),
      'META-INF/manifest.xml': strToU8('<manifest:manifest/>'), 'content.xml': strToU8('<office:document-content>cell =SUM(A1:A3)</office:document-content>'),
      'styles.xml': strToU8('<styles/>'), 'Pictures/100000.jpg': noisyJpeg(),
    }
    const src = zipSync(files)
    await input(page).setInputFiles(upload(`doc.${ext}`, src))
    await expect(page.getByText('1 embedded image')).toBeVisible()
    await page.getByLabel(/Strong/).check()
    await page.getByRole('button', { name: new RegExp(`Optimize ${ext}`, 'i') }).click()
    await expect(page.getByText(/% smaller/)).toBeVisible()
    const out = await download(page, () => page.getByRole('button', { name: /Download optimized/ }).click())
    expect(out.name).toBe(`doc-optimized.${ext}`)

    expect(firstEntry(out.data)).toEqual({ name: 'mimetype', method: 0, extra: 0 })
    const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.data)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    for (const n of Object.keys(before)) if (n !== 'Pictures/100000.jpg') expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
    expect(after['Pictures/100000.jpg']!.length).toBeLessThan(before['Pictures/100000.jpg']!.length)
    expect([after['Pictures/100000.jpg']![0], after['Pictures/100000.jpg']![1]]).toEqual([0xff, 0xd8])
  })
}

test('odf optimizer rejects a .docx and macro/encrypted packages', async ({ page }) => {
  await page.goto('/odf-optimizer')
  await input(page).setInputFiles(upload('a.docx', zipSync({ x: strToU8('y') })))
  await expect(page.getByRole('alert')).toContainText('.odt / .ods / .odp')
  await page.reload()
  const macro = zipSync({ mimetype: stored('application/vnd.oasis.opendocument.text'), 'META-INF/manifest.xml': strToU8('x'), 'content.xml': strToU8('x'), 'Basic/Standard/Module1.xml': strToU8('Sub Main') })
  await input(page).setInputFiles(upload('macro.odt', macro))
  await expect(page.getByRole('alert')).toContainText('macros')
  await page.reload()
  const enc = zipSync({ mimetype: stored('application/vnd.oasis.opendocument.text'), 'META-INF/manifest.xml': strToU8('<manifest><encryption-data/></manifest>'), 'content.xml': strToU8('x') })
  await input(page).setInputFiles(upload('secret.odt', enc))
  await expect(page.getByRole('alert')).toContainText('password-protected')
})

test('epub: optimizes images anywhere in the package, mimetype stays first and stored', async ({ page }) => {
  await page.goto('/epub-optimizer')
  const files: Zippable = {
    mimetype: stored('application/epub+zip'), 'META-INF/container.xml': strToU8('<container/>'), 'OEBPS/content.opf': strToU8('<package/>'),
    'OEBPS/chapter1.xhtml': strToU8('<html><img src="images/cover.jpg"/></html>'), 'OEBPS/images/cover.jpg': noisyJpeg(), 'OEBPS/style.css': strToU8('body{}'),
  }
  const src = zipSync(files)
  await input(page).setInputFiles(upload('book.epub', src))
  await expect(page.getByText('1 embedded image')).toBeVisible()
  await page.getByLabel(/Strong/).check()
  await page.getByRole('button', { name: /Optimize epub/i }).click()
  await expect(page.getByText(/% smaller/)).toBeVisible()
  const out = await download(page, () => page.getByRole('button', { name: /Download optimized/ }).click())
  expect(out.name).toBe('book-optimized.epub')
  expect(firstEntry(out.data)).toEqual({ name: 'mimetype', method: 0, extra: 0 })
  const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.data)
  expect(Object.keys(after)).toEqual(Object.keys(before))
  for (const n of Object.keys(before)) if (n !== 'OEBPS/images/cover.jpg') expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
  expect(after['OEBPS/images/cover.jpg']!.length).toBeLessThan(before['OEBPS/images/cover.jpg']!.length)
})

test('zip tools: open a real .tar, extract a file byte-for-byte', async ({ page }) => {
  await page.goto('/zip-tools')
  await input(page).setInputFiles(upload('sample.tar', new Uint8Array(fixtureBytes('sample.tar'))))
  await expect(page.getByRole('status').filter({ hasText: 'sample.tar' })).toContainText('2 files')
  const got = await download(page, () => page.getByRole('button', { name: 'Extract dir/b.txt' }).click())
  expect(got.name).toBe('b.txt')
  expect(new TextDecoder().decode(got.data)).toBe('second file\n')
})

test('zip tools: open .tar.gz and a plain .gz', async ({ page }) => {
  await page.goto('/zip-tools')
  await input(page).setInputFiles(upload('sample.tar.gz', new Uint8Array(fixtureBytes('sample.tar.gz'))))
  await expect(page.getByText('Compressed TAR archive')).toBeVisible()
  const a = await download(page, () => page.getByRole('button', { name: 'Extract a.txt' }).click())
  expect(new TextDecoder().decode(a.data)).toBe('hello from tar\n')
  await page.getByRole('button', { name: 'Close' }).click()
  await input(page).setInputFiles(upload('single.txt.gz', new Uint8Array(fixtureBytes('single.txt.gz'))))
  const b = await download(page, () => page.getByRole('button', { name: 'Extract single.txt' }).click())
  expect(new TextDecoder().decode(b.data)).toBe('hello from tar\n')
})

test('zip tools: a tar with a traversal path and a symlink cannot be extracted', async ({ page }) => {
  const block = (name: string, flag: string, data = '') => {
    const h = new Uint8Array(512)
    h.set(strToU8(name), 0); h.set(strToU8(data.length.toString(8).padStart(11, '0')), 124); h[156] = flag.charCodeAt(0); h.set(strToU8('ustar'), 257); h.fill(32, 148, 156)
    h.set(strToU8(h.reduce((s, v) => s + v, 0).toString(8).padStart(6, '0') + '\0 '), 148)
    const body = strToU8(data); const pad = new Uint8Array((512 - (body.length % 512)) % 512)
    return [h, body, pad]
  }
  const parts = [...block('../../evil.sh', '0', 'rm -rf /'), ...block('lnk', '2'), new Uint8Array(1024)]
  const tar = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { tar.set(p, o); o += p.length }
  await page.goto('/zip-tools')
  await input(page).setInputFiles(upload('evil.tar', tar))
  await expect(page.getByText('unsafe path, blocked')).toBeVisible()
  await expect(page.getByText('link: never extracted')).toBeVisible()
  for (const b of await page.getByRole('button', { name: /^Extract / }).all()) await expect(b).toBeDisabled()
})

test.describe('Kalan Vidhi Doc Tool branding', () => {
  test('header, hero, footer and tab title use the new brand', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Kalan Vidhi Doc Tool home' })).toBeVisible()
    await expect(page.getByRole('banner')).toContainText('Kalan Vidhi')
    await expect(page.getByRole('banner')).toContainText('Doc Tool')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Free file compression and conversion')
    await expect(page.locator('main')).toContainText('Kalan Vidhi Doc Tool')
    await expect(page.getByRole('contentinfo')).toContainText('Kalan Vidhi')
    await expect(page).toHaveTitle(/Kalan Vidhi Doc Tool/)
    await page.goto('/image-compressor')
    await expect(page).toHaveTitle('Image Compressor | Kalan Vidhi Doc Tool')
  })

  test('static HTML (what social crawlers see) has branded Open Graph tags, favicon and manifest', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toContain('<title>Kalan Vidhi Doc Tool')
    expect(html).toMatch(/property="og:title" content="Kalan Vidhi Doc Tool/)
    expect(html).toMatch(/property="og:site_name" content="Kalan Vidhi Doc Tool"/)
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).not.toContain('__SITE_URL__') // placeholders are always resolved or removed
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({ name: 'Kalan Vidhi Doc Tool', short_name: 'Doc Tool' })
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true)
    expect((await request.get('/og-image.png')).ok()).toBe(true)
  })

  test('the old product name appears nowhere in served pages, scripts or the manifest', async ({ request }) => {
    const old = new RegExp('File' + 'Squeeze', 'i')
    const html = await (await request.get('/')).text()
    expect(html).not.toMatch(old)
    for (const src of [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]!)) expect(await (await request.get(src)).text(), src).not.toMatch(old)
    expect(await (await request.get('/manifest.webmanifest')).text()).not.toMatch(old)
  })
})
