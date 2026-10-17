import type { Page } from '@playwright/test'

export interface Spec { name: string; mime: 'image/jpeg' | 'image/png' | 'image/webp'; w: number; h: number; transparent?: boolean }

/** Creates real image files inside the browser and drops them on the page's file input. */
export async function addImages(page: Page, specs: Spec[]) {
  await page.locator('input[type=file]').waitFor({ state: 'attached' })
  await page.evaluate(async (specs) => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    const dt = new DataTransfer()
    for (const s of specs) {
      const c = document.createElement('canvas'); c.width = s.w; c.height = s.h
      const ctx = c.getContext('2d')!
      if (!s.transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, s.w, s.h) }
      for (let i = 0; i < 4000; i++) { ctx.fillStyle = `hsl(${(i * 37) % 360} 80% 50%)`; ctx.fillRect((i * 7919) % s.w, (i * 104729) % s.h, 12, 12) }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), s.mime, 1))
      dt.items.add(new File([blob], s.name, { type: s.mime, lastModified: Math.random() * 1e9 }))
    }
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, specs)
}

export async function addRawFile(page: Page, name: string, bytes: number[]) {
  await page.locator('input[type=file]').waitFor({ state: 'attached' })
  await page.evaluate(({ name, bytes }) => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], name))
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  }, { name, bytes })
}

import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'

export const fixtureBytes = (name: string) => readFileSync(`fixtures/${name}`)

/** Upload a genuine fixture, optionally pretending it has another name / MIME type (what a browser might report). */
export async function uploadFixture(page: Page, file: string, opts: { as?: string; mime?: string; input?: number } = {}) {
  const input = page.locator('input[type=file]').nth(opts.input ?? 0)
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({ name: opts.as ?? file, mimeType: opts.mime ?? 'application/octet-stream', buffer: fixtureBytes(file) })
}

export interface Decoded { width: number; height: number; hasAlpha: boolean }

/** Decode bytes with the browser's own decoder and report what is really in them. */
export async function decodeInBrowser(page: Page, bytes: Uint8Array | Buffer): Promise<Decoded> {
  return page.evaluate(async (b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([raw]))
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let hasAlpha = false; for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) { hasAlpha = true; break }
    return { width: bmp.width, height: bmp.height, hasAlpha }
  }, Buffer.from(bytes).toString('base64'))
}

/** Largest per-channel difference between two images' pixels (dimensions must match). */
export async function maxPixelDiff(page: Page, a: Uint8Array | Buffer, b: Uint8Array | Buffer): Promise<number> {
  return page.evaluate(async ([x, y]) => {
    const px = async (b64: string) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data
    }
    const [p, q] = await Promise.all([px(x!), px(y!)])
    if (p.length !== q.length) return 255
    let m = 0; for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i]! - q[i]!)); return m
  }, [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')])
}

export const row = (page: Page, name: string) => page.locator('li').filter({ hasText: name }).first()

/** Click Download in a result row and return the file the browser would save. */
export async function downloadRow(page: Page, name: string) {
  const p = page.waitForEvent('download')
  await row(page, name).getByRole('button', { name: 'Download', exact: true }).click()
  const d = await p
  return { filename: d.suggestedFilename(), bytes: readFileSync(await d.path()) }
}

export const sizeFromRow = async (page: Page, name: string): Promise<number> => {
  const t = await row(page, name).innerText()
  const m = /Result: ([\d.]+) (B|KB|MB)/.exec(t)
  if (!m) throw new Error(`no result size in: ${t}`)
  return Number(m[1]) * ({ B: 1, KB: 1024, MB: 1048576 }[m[2] as 'B'])
}

export async function waitDone(page: Page, name: string) {
  await expect(row(page, name)).not.toContainText(/Processing…|Waiting/, { timeout: 30_000 })
}

export const magic = (b: Uint8Array) => Buffer.from(b.subarray(0, 4)).toString('hex')
export const isPng = (b: Uint8Array) => magic(b) === '89504e47'
export const isJpeg = (b: Uint8Array) => magic(b).startsWith('ffd8ff')
export const isWebp = (b: Uint8Array) => Buffer.from(b.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString() === 'WEBP'
