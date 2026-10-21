// Loads the app's own SEO data (src/seo/meta.ts, src/config/brand.ts) into plain Node, so the build step and the
// verification scripts use exactly the routes, copy and site URL the app uses at runtime.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { loadEnv } from 'vite'

export async function loadSeoSource(root = process.cwd()) {
  const outfile = resolve(root, 'node_modules/.cache/seo/meta.mjs')
  // The bundle is written inside node_modules so its external packages (lucide-react, ...) resolve.
  await build({
    stdin: {
      contents: "export * from './src/seo/meta.ts'; export { BRAND, resolveSiteUrl } from './src/config/brand.ts'",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, packages: 'external', logLevel: 'error',
  })
  const m = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
  // Same lookup as the site-url plugin in vite.config.ts. Unset or blank means the production default; an invalid
  // override throws here, which fails the build.
  const site = m.resolveSiteUrl(loadEnv('production', root, 'VITE_').VITE_SITE_URL ?? process.env.VITE_SITE_URL)
  return {
    site,
    parentUrl: m.BRAND.parentUrl,
    productionUrl: m.BRAND.siteUrl,
    pages: m.allPages(),
    notFound: m.NOT_FOUND_PAGE,
    jsonLdFor: m.jsonLdFor,
    serializeJsonLd: m.serializeJsonLd,
  }
}
