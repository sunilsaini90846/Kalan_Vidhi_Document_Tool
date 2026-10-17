/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * Social crawlers do not run JavaScript, so Open Graph / canonical tags live in index.html.
 * __SITE_URL__ is replaced with VITE_SITE_URL; without it, the tags that need an absolute URL are removed.
 */
function siteUrl(): Plugin {
  let site = ''
  return {
    name: 'site-url-html',
    configResolved(c) { site = (loadEnv(c.mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? process.env.VITE_SITE_URL ?? '').replace(/\/$/, '') },
    transformIndexHtml: (html) => (site ? html.replaceAll('__SITE_URL__', site) : html.split('\n').filter((l) => !l.includes('__SITE_URL__')).join('\n')),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist', sourcemap: false },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
