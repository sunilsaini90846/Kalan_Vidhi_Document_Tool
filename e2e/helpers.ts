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
