/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteUrl } from './src/config/brand'

/**
 * Social crawlers do not run JavaScript, so Open Graph / canonical tags live in index.html.
 * __SITE_URL__ is replaced with the site origin: BRAND.siteUrl unless VITE_SITE_URL overrides it (an invalid
 * override throws, which fails the build).
 */
function siteUrl(): Plugin {
  let site = ''
  return {
    name: 'site-url-html',
    configResolved(c) { site = resolveSiteUrl(loadEnv(c.mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? process.env.VITE_SITE_URL) },
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', site),
  }
}

/**
 * Mirrors Firebase Hosting (trailingSlash: false, no catch-all rewrite) for `vite preview`, which would otherwise answer
 * every unknown URL with the SPA shell and HTTP 200:
 *  - /<route> serves dist/<route>/index.html (preview only does that for URLs with a trailing slash);
 *  - any other path that is not a file in dist gets dist/404.html with status 404, exactly like Hosting.
 */
function hostingPreview(): Plugin {
  return {
    name: 'hosting-preview',
    configurePreviewServer(server) {
      const dist = resolve(server.config.build.outDir)
      const send = (res: import('node:http').ServerResponse, file: string, status: number) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'text/html')
        res.end(readFileSync(file))
      }
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/\/+$/, '')
        if (!path) return next()
        const target = resolve(dist, `.${path}`)
        if (!target.startsWith(dist + sep)) return next()
        const routeHtml = resolve(target, 'index.html')
        if (!extname(path) && existsSync(routeHtml)) return send(res, routeHtml, 200)
        if (existsSync(target) && statSync(target).isFile()) return next()
        if (existsSync(resolve(dist, '404.html'))) return send(res, resolve(dist, '404.html'), 404)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl(), hostingPreview()],
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
