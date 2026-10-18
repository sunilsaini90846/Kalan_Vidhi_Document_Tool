import { expect, test, type Page } from '@playwright/test'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { dl, jpegFixture, mediaDir, ooxml, upload } from '../tool-kit'
import { fixtureBytes } from '../helpers'

export type Kind = 'docx' | 'pptx' | 'xlsx'
const title = (k: Kind) => `${k.toUpperCase()} Optimizer`

/** The full behavioural suite shared by the three OOXML optimizers (one describe per tool, in its own spec file). */
export function ooxmlSuite(kind: Kind) {
  const dir = mediaDir(kind)
  const optimize = (page: Page) => page.getByRole('button', { name: new RegExp(`Optimize ${kind}`, 'i') }).click()

  test.describe(title(kind), () => {
    test('page states what it does, accepted format and the macro/encryption exclusions', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await expect(page.getByRole('heading', { level: 1, name: title(kind) })).toBeVisible()
      await expect(page.getByText(/Accepted:/)).toContainText(kind.toUpperCase())
      await expect(page.getByText(/Macro-enabled, password-protected/)).toBeVisible()
    })

    test('inspects the file: parts, embedded images by type, and sizes', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `f.${kind}`, ooxml(kind, { 'a.jpg': jpegFixture(), 'b.png': new Uint8Array(fixtureBytes('photo.png')), 'c.emf': strToU8('emf') }))
      await expect(page.getByText('3 embedded images')).toBeVisible()
      await expect(page.getByText('JPEG: 1 · PNG: 1 · other: 1')).toBeVisible()
      await page.getByText('Show images').click()
      await expect(page.getByText('c.emf').first()).toBeVisible()
    })

    test('optimizes JPEGs; every other part is byte-identical and the download is a valid package', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      const src = ooxml(kind, { 'photo.jpg': jpegFixture(), 'logo.emf': strToU8('emf-bytes') })
      await upload(page, `report.${kind}`, src)
      await page.getByLabel(/Strong/).check(); await optimize(page)
      await expect(page.getByText(/% smaller/)).toBeVisible()
      await expect(page.getByText('optimized: 1')).toBeVisible()
      const out = await dl(page, /Download optimized/)
      expect(out.filename).toBe(`report-optimized.${kind}`)
      const before = unzipSync(new Uint8Array(src)), after = unzipSync(out.bytes)
      expect(Object.keys(after)).toEqual(Object.keys(before))
      for (const n of Object.keys(before)) if (n !== `${dir}photo.jpg`) expect(Buffer.from(after[n]!).equals(Buffer.from(before[n]!)), n).toBe(true)
      expect(after[`${dir}photo.jpg`]!.length).toBeLessThan(before[`${dir}photo.jpg`]!.length)
      expect([after[`${dir}photo.jpg`]![0], after[`${dir}photo.jpg`]![1]]).toEqual([0xff, 0xd8])
    })

    test('presets are real: Strong gives a smaller file than Light', async ({ page }) => {
      const sizes: number[] = []
      for (const re of [/Light/, /Strong/]) {
        await page.goto(`/${kind}-optimizer`)
        await upload(page, `r.${kind}`, ooxml(kind, { 'photo.jpg': jpegFixture() }))
        await page.getByLabel(re).check(); await optimize(page)
        await expect(page.getByText(/% smaller/)).toBeVisible()
        sizes.push((await dl(page, /Download optimized/)).bytes.length)
      }
      expect(sizes[1]).toBeLessThan(sizes[0]!)
    })

    test('large PNGs are downscaled by Balanced/Strong but untouched by Light', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      const big = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 2600; c.height = 1800; const ctx = c.getContext('2d')!
        const img = ctx.createImageData(2600, 1800); for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255 }
        ctx.putImageData(img, 0, 0)
        const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'))
        return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]!); r.readAsDataURL(b) })
      })
      const png = new Uint8Array(Buffer.from(big, 'base64'))
      await upload(page, `p.${kind}`, ooxml(kind, { 'big.png': png }))
      await page.getByLabel(/Light/).check(); await optimize(page)
      await expect(page.getByText(/No size reduction|optimized: 0/).first()).toBeVisible()
      await page.getByLabel(/Balanced/).check(); await optimize(page)
      await expect(page.getByText('optimized: 1')).toBeVisible()
      expect(unzipSync((await dl(page, /Download optimized/)).bytes)[`${dir}big.png`]!.length).toBeLessThan(png.length)
    })

    test('a document with no images says there is nothing to optimize and offers no run button', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `plain.${kind}`, ooxml(kind))
      await expect(page.getByText(/No embedded images were found/)).toBeVisible()
      await expect(page.getByRole('button', { name: /^Optimize/ })).toHaveCount(0)
    })

    test('images that cannot shrink give an honest "no reduction" and no download', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `s.${kind}`, ooxml(kind, { 'small.jpg': new Uint8Array(fixtureBytes('photo-q30.jpg')) }))
      await page.getByLabel(/Light/).check(); await optimize(page)
      await expect(page.getByText(/No size reduction was possible/)).toBeVisible()
      await expect(page.getByRole('button', { name: /Download optimized/ })).toHaveCount(0)
    })

    test('CMYK-like or fake images are left unchanged (a PNG named .jpg is not recompressed)', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `m.${kind}`, ooxml(kind, { 'fake.jpg': new Uint8Array(fixtureBytes('photo.png')) }))
      await page.getByText('Show images').click()
      await expect(page.getByText(/extension does not match content; left untouched/)).toBeVisible()
    })

    test('macro-enabled names, VBA content, the wrong format and non-packages are rejected', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `evil.${({ docx: 'docm', pptx: 'pptm', xlsx: 'xlsm' })[kind]}`, ooxml(kind))
      await expect(page.getByRole('alert')).toContainText('Macro-enabled')
      await page.reload()
      await upload(page, `vba.${kind}`, ooxml(kind, {}, { 'word/vbaProject.bin': strToU8('x') }))
      await expect(page.getByRole('alert')).toContainText('macros')
      await page.reload()
      const other: Kind = kind === 'docx' ? 'xlsx' : 'docx'
      await upload(page, `wrong.${kind}`, ooxml(other))
      await expect(page.getByRole('alert')).toContainText(`valid ${kind.toUpperCase()}`)
      await page.reload()
      await upload(page, `fake.${kind}`, Buffer.from('not a zip'))
      await expect(page.getByRole('alert')).toContainText(/not a supported file type/)
      await page.reload()
      await upload(page, `slip.${kind}`, Buffer.from(zipSync({ '../evil.xml': strToU8('x'), '[Content_Types].xml': strToU8('x') })))
      await expect(page.getByRole('alert')).toBeVisible()
    })

    test('a file with the wrong extension is refused with the right extension named', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, 'renamed.zip', ooxml(kind))
      await expect(page.getByRole('alert')).toContainText(`.${kind}`)
    })

    test('choose another file returns to the picker', async ({ page }) => {
      await page.goto(`/${kind}-optimizer`)
      await upload(page, `r.${kind}`, ooxml(kind, { 'photo.jpg': jpegFixture() }))
      await page.getByRole('button', { name: 'Choose another file' }).click()
      await expect(page.getByText(/Accepted:/)).toBeVisible()
    })
  })
}
