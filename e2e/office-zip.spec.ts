import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strToU8, unzipSync, zipSync } from 'fflate'

const input = (page: Page) => page.locator('input[type=file]')
async function download(page: Page, click: () => Promise<void>) {
  const p = page.waitForEvent('download'); await click(); const d = await p
  return { name: d.suggestedFilename(), data: new Uint8Array(readFileSync(await d.path())) }
}

async function noisyJpeg(page: Page, w = 1800, h = 1200): Promise<Uint8Array> {
  const b64 = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 40)}%)`; ctx.fillRect((i * 7919) % w, (i * 104729) % h, 14, 14) }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 1))
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]!); r.readAsDataURL(blob) })
  }, { w, h })
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

const MAIN = { docx: ['word/document.xml', 'wordprocessingml.document.main+xml', 'word/media/'], pptx: ['ppt/presentation.xml', 'presentationml.presentation.main+xml', 'ppt/media/'], xlsx: ['xl/workbook.xml', 'spreadsheetml.sheet.main+xml', 'xl/media/'] } as const
function office(kind: keyof typeof MAIN, media: Record<string, Uint8Array> = {}, extra: Record<string, Uint8Array> = {}) {
  const [main, ct, dir] = MAIN[kind]
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${ct}"/></Types>`),
    '_rels/.rels': strToU8('<Relationships/>'),
    [main]: strToU8('<root>unchanged text =SUM(A1:A3)</root>'),
    ...extra,
  }
  for (const [n, d] of Object.entries(media)) files[dir + n] = d
  return Buffer.from(zipSync(files))
}
const upload = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/octet-stream', buffer })

for (const kind of ['docx', 'pptx', 'xlsx'] as const) {
  test(`${kind}: optimizes embedded JPEGs and leaves every other part identical`, async ({ page }) => {
    await page.goto(`/${kind}-optimizer`)
    const jpeg = await noisyJpeg(page)
    const src = office(kind, { 'photo.jpg': jpeg, 'logo.emf': strToU8('emf-bytes') })
    await input(page).setInputFiles(upload(`report.${kind}`, src))
    await expect(page.getByText('2 embedded images')).toBeVisible()
    await page.getByLabel(/Strong/).check()
    await page.getByRole('button', { name: new RegExp(`Optimize ${kind}`, 'i') }).click()
    await expect(page.getByText(/% smaller/)).toBeVisible()
    await expect(page.getByText('optimized: 1')).toBeVisible()
    const out = await download(page, () => page.getByRole('button', { name: /Download optimized/ }).click())
    expect(out.name).toBe(`report-optimized.${kind}`)

    const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.data)
    expect(Object.keys(after)).toEqual(Object.keys(before))
    const [main, , dir] = MAIN[kind]
    for (const n of Object.keys(before)) {
      if (n === `${dir}photo.jpg`) continue
      expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
    }
    const photo = after[`${dir}photo.jpg`]!
    expect(photo.length).toBeLessThan(before[`${dir}photo.jpg`]!.length * 0.6)
    expect([photo[0], photo[1]]).toEqual([0xff, 0xd8])
    expect(new TextDecoder().decode(after[main])).toContain('=SUM(A1:A3)')
  })
}

test('text-only document: honest "no reduction" and no download', async ({ page }) => {
  await page.goto('/docx-optimizer')
  await input(page).setInputFiles(upload('plain.docx', office('docx')))
  await expect(page.getByText(/No embedded images were found/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Optimize/ })).toHaveCount(0)
})

test('macro-enabled and malformed Office files are rejected', async ({ page }) => {
  await page.goto('/docx-optimizer')
  await input(page).setInputFiles(upload('evil.docm', office('docx')))
  await expect(page.getByRole('alert')).toContainText('Macro-enabled')
  await page.reload()
  await input(page).setInputFiles(upload('vba.docx', office('docx', {}, { 'word/vbaProject.bin': strToU8('x') })))
  await expect(page.getByRole('alert')).toContainText('macros')
  await page.reload()
  await input(page).setInputFiles(upload('wrong.docx', office('xlsx')))
  await expect(page.getByRole('alert')).toContainText('valid DOCX')
})

test('zip tools: create, verify, inspect and extract a single file', async ({ page }) => {
  await page.goto('/zip-tools')
  await input(page).nth(1).setInputFiles([
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello '.repeat(500)) },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('world') },
  ])
  await page.getByRole('button', { name: 'Create ZIP' }).click()
  await expect(page.getByText(/Created and verified/)).toBeVisible()
  const made = await download(page, () => page.getByRole('button', { name: 'Download ZIP' }).click())
  expect(Object.keys(unzipSync(made.data)).sort()).toEqual(['a.txt', 'b.txt'])

  await input(page).first().setInputFiles(upload('t.zip', Buffer.from(made.data)))
  await expect(page.getByRole('status').filter({ hasText: 't.zip' })).toBeVisible()
  const got = await download(page, () => page.getByRole('button', { name: 'Extract b.txt' }).click())
  expect(got.name).toBe('b.txt')
  expect(new TextDecoder().decode(got.data)).toBe('world')
})

test('zip tools: blocks extraction of zip-slip entries', async ({ page }) => {
  await page.goto('/zip-tools')
  const slip = Buffer.from(zipSync({ '../../evil.sh': strToU8('rm -rf /') }))
  await input(page).first().setInputFiles(upload('slip.zip', slip))
  await expect(page.getByRole('status').filter({ hasText: 'slip.zip' })).toBeVisible()
  await expect(page.getByText('unsafe path, blocked')).toBeVisible()
  await expect(page.getByRole('button', { name: /Extract/ })).toBeDisabled()
})
