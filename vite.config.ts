/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
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

/**
 * `vite preview` only serves dist/<route>/index.html for URLs with a trailing slash. Firebase Hosting (trailingSlash: false)
 * serves it at /<route>, so mirror that here; otherwise preview and the e2e suite would see the SPA shell instead.
 */
function routeHtmlPreview(): Plugin {
  return {
    name: 'route-html-preview',
    configurePreviewServer(server) {
      const dist = resolve(server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/\/+$/, '')
        const file = resolve(dist, `.${path}`, 'index.html')
        if (path && !extname(path) && file.startsWith(dist + sep) && existsSync(file)) {
          res.setHeader('Content-Type', 'text/html')
          res.end(readFileSync(file))
        } else next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl(), routeHtmlPreview()],
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
