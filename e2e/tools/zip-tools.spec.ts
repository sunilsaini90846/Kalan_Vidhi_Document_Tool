import { expect, test, type Page } from '@playwright/test'
import { gzipSync, strToU8, unzipSync, zipSync } from 'fflate'
import { fixtureBytes } from '../helpers'
import { dl, upload } from '../tool-kit'

const open = (page: Page, name: string, data: Uint8Array | Buffer) => upload(page, name, data, { n: 0 })
const add = (page: Page, name: string, data: Uint8Array | Buffer) => upload(page, name, data, { n: 1 })

function tarOf(entries: { name: string; data?: string; flag?: string }[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const e of entries) {
    const body = strToU8(e.data ?? ''); const h = new Uint8Array(512)
    h.set(strToU8(e.name), 0); h.set(strToU8(body.length.toString(8).padStart(11, '0')), 124); h[156] = (e.flag ?? '0').charCodeAt(0); h.set(strToU8('ustar'), 257); h.fill(32, 148, 156)
    h.set(strToU8(h.reduce((s, v) => s + v, 0).toString(8).padStart(6, '0') + '\0 '), 148)
    parts.push(h, body, new Uint8Array((512 - (body.length % 512)) % 512))
  }
  parts.push(new Uint8Array(1024))
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

test.describe('ZIP Tools: inspect and extract', () => {
  test('page lists accepted archive formats, the limits and the safety rules', async ({ page }) => {
    await page.goto('/zip-tools')
    await expect(page.getByRole('heading', { level: 1, name: 'ZIP Tools' })).toBeVisible()
    await expect(page.getByText(/Accepted:/).first()).toContainText('ZIP, TAR, GZIP')
    await expect(page.getByText(/5000 entries/)).toBeVisible()
    await expect(page.getByText(/7Z and RAR are not supported/)).toBeVisible()
  })

  test('ZIP: lists files with sizes, folders hidden, and extracts one file byte-for-byte', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'a.zip', Buffer.from(zipSync({ 'docs/readme.txt': strToU8('hello zip'), 'img/p.jpg': new Uint8Array(fixtureBytes('photo-q95.jpg')), 'empty/': new Uint8Array(0) })))
    await expect(page.getByRole('status').filter({ hasText: 'a.zip' })).toContainText('2 files')
    await expect(page.getByLabel('Archive contents')).toContainText('docs/readme.txt')
    const a = await dl(page, 'Extract docs/readme.txt')
    expect(a.filename).toBe('readme.txt') // folders are never created: base name only
    expect(new TextDecoder().decode(a.bytes)).toBe('hello zip')
    const b = await dl(page, 'Extract img/p.jpg')
    expect(Buffer.from(b.bytes).equals(fixtureBytes('photo-q95.jpg'))).toBe(true)
  })

  test('ZIP: unsafe paths are flagged and cannot be extracted; executables are warned about', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'bad.zip', Buffer.from(zipSync({ '../../evil.sh': strToU8('rm -rf /'), 'C:\\win.txt': strToU8('x'), 'setup.exe': strToU8('MZ') })))
    await expect(page.getByText('unsafe path, blocked')).toHaveCount(2)
    await expect(page.getByText(/executable type/)).toHaveCount(2) // .sh and .exe
    await expect(page.getByRole('button', { name: 'Extract ../../evil.sh' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Extract setup.exe' })).toBeEnabled() // listed, warned, never run
  })

  test('ZIP: a decompression bomb is refused before anything is inflated', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'bomb.zip', Buffer.from(zipSync({ 'zeros.bin': new Uint8Array(400 * 1024 * 1024) }, { level: 9 })))
    await expect(page.getByRole('alert')).toContainText(/safe size limit|single file larger/)
    await expect(page.getByRole('button', { name: /^Extract/ })).toHaveCount(0)
  })

  test('TAR and TAR.GZ: listing and extraction; a plain .gz opens as a single file', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'sample.tar', fixtureBytes('sample.tar'))
    await expect(page.getByRole('status').filter({ hasText: 'sample.tar' })).toContainText('2 files')
    expect(new TextDecoder().decode((await dl(page, 'Extract dir/b.txt')).bytes)).toBe('second file\n')
    await page.getByRole('button', { name: 'Close' }).click()
    await open(page, 'sample.tar.gz', fixtureBytes('sample.tar.gz'))
    await expect(page.getByText('Compressed TAR archive')).toBeVisible()
    expect(new TextDecoder().decode((await dl(page, 'Extract a.txt')).bytes)).toBe('hello from tar\n')
    await page.getByRole('button', { name: 'Close' }).click()
    await open(page, 'note.txt.gz', Buffer.from(gzipSync(strToU8('plain gz'))))
    expect(new TextDecoder().decode((await dl(page, 'Extract note.txt')).bytes)).toBe('plain gz')
  })

  test('TAR: traversal paths and links cannot be extracted', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'evil.tar', Buffer.from(tarOf([{ name: '../../evil.sh', data: 'rm' }, { name: 'lnk', flag: '2' }, { name: 'ok.txt', data: 'fine' }])))
    await expect(page.getByText('unsafe path, blocked')).toBeVisible()
    await expect(page.getByText('link: never extracted')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Extract ../../evil.sh' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Extract lnk' })).toBeDisabled()
    expect(new TextDecoder().decode((await dl(page, 'Extract ok.txt')).bytes)).toBe('fine')
  })

  test('damaged inputs fail with a clear message and no crash: truncated tar, gzip bomb, garbage zip, non-archives', async ({ page }) => {
    await page.goto('/zip-tools')
    const bad = async (name: string, data: Uint8Array | Buffer, message: string | RegExp) => {
      await page.reload(); await open(page, name, data)
      await expect(page.getByRole('alert').first()).toContainText(message)
    }
    await bad('cut.tar', fixtureBytes('sample.tar').subarray(0, 700), /truncated|damaged/)
    await bad('bomb.gz', Buffer.from(gzipSync(new Uint8Array(400 * 1024 * 1024))), /safe size limit/)
    await bad('cut.gz', fixtureBytes('single.txt.gz').subarray(0, 12), /damaged/)
    await bad('garbage.zip', Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(40, 9)]), /not a valid ZIP|damaged/)
    await bad('pic.zip', fixtureBytes('photo-q95.jpg'), /is a JPEG file\. This tool accepts ZIP, GZIP/)
    await bad('a.7z', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4, 1, 2, 3, 4, 5, 6, 7, 8]), /7Z.*not supported/)
  })

  test('closing an archive returns to the picker', async ({ page }) => {
    await page.goto('/zip-tools')
    await open(page, 'a.zip', Buffer.from(zipSync({ 'a.txt': strToU8('x') })))
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Drop an archive here')).toBeVisible()
  })
})

test.describe('ZIP Tools: create', () => {
  test('creates a ZIP of the chosen files, verified, with the right contents and name', async ({ page }) => {
    await page.goto('/zip-tools')
    await add(page, 'a.txt', Buffer.from('hello '.repeat(500))); await add(page, 'b.txt', Buffer.from('world'))
    await expect(page.getByRole('status').filter({ hasText: '2 files' }).last()).toBeVisible()
    await page.getByLabel('File name').fill('my files.zip')
    await page.getByRole('button', { name: 'Create ZIP' }).click()
    await expect(page.getByText(/Created and verified/)).toBeVisible()
    await expect(page.getByText(/% smaller/)).toBeVisible() // repetitive text really compresses
    const out = await dl(page, 'Download ZIP')
    expect(out.filename).toBe('my files.zip')
    const files = unzipSync(out.bytes)
    expect(Object.keys(files).sort()).toEqual(['a.txt', 'b.txt'])
    expect(new TextDecoder().decode(files['b.txt']!)).toBe('world')
  })

  test('compression choice: automatic stores already-compressed files; maximum compresses text harder; store-only never shrinks', async ({ page }) => {
    const sizes: Record<string, number> = {}
    for (const [label, value] of [['auto', 'auto'], ['store', '0'], ['max', '9']] as const) {
      await page.goto('/zip-tools')
      await add(page, 'data.txt', Buffer.from('abcdefgh'.repeat(20000)))
      await page.getByLabel('Compression').selectOption(value)
      await page.getByRole('button', { name: 'Create ZIP' }).click()
      sizes[label] = (await dl(page, 'Download ZIP')).bytes.length
    }
    expect(sizes.store).toBeGreaterThan(160000)
    expect(sizes.auto).toBeLessThan(sizes.store!)
    expect(sizes.max).toBeLessThanOrEqual(sizes.auto!)
  })

  test('zipping already-compressed files shows the real size increase, not a saving', async ({ page }) => {
    await page.goto('/zip-tools')
    await add(page, 'photo.jpg', fixtureBytes('photo-q95.jpg'))
    await page.getByRole('button', { name: 'Create ZIP' }).click()
    await expect(page.getByText(/larger: these files are already compressed/)).toBeVisible()
    await expect(page.getByText(/\d% smaller/)).toHaveCount(0)
  })

  test('duplicate names get unique entries; dangerous characters in names are neutralised', async ({ page }) => {
    await page.goto('/zip-tools')
    await add(page, 'same.txt', Buffer.from('one'))
    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('twoo') }) // different size = distinct file
    await add(page, '..evil:name?.txt', Buffer.from('x'))
    await page.getByRole('button', { name: 'Create ZIP' }).click()
    const names = Object.keys(unzipSync((await dl(page, 'Download ZIP')).bytes))
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    expect(names.some((n) => n.includes('..') || n.includes(':') || n.includes('?'))).toBe(false)
  })

  test('remove, clear all, and the same file twice is rejected as a duplicate', async ({ page }) => {
    await page.goto('/zip-tools')
    await add(page, 'a.txt', Buffer.from('a')); await add(page, 'b.txt', Buffer.from('bb'))
    await page.getByRole('button', { name: 'Remove a.txt' }).click()
    await expect(page.getByLabel('Files to zip')).not.toContainText('a.txt')
    await page.getByRole('button', { name: /Clear all/ }).click()
    await expect(page.getByRole('button', { name: 'Create ZIP' })).toHaveCount(0)
  })

  test('empty files are rejected up front', async ({ page }) => {
    await page.goto('/zip-tools')
    await add(page, 'empty.txt', Buffer.alloc(0))
    await expect(page.getByRole('alert')).toContainText('empty')
    await expect(page.getByRole('button', { name: 'Create ZIP' })).toHaveCount(0)
  })
})
