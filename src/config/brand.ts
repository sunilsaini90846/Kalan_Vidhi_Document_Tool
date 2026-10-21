/** Single source of truth for the product name. Change it here, not in components. */
export const BRAND = {
  parent: 'Kalan Vidhi',
  product: 'Doc Tool',
  name: 'Kalan Vidhi Doc Tool',
  tagline: 'Free, private file compression and conversion',
  description: 'Free, private tools to compress and convert images, PDFs, Office documents and archives. Supported tools run in your browser with no sign-up.',
  /** Production origin of this product. Canonical URLs, the sitemap and structured data are built from it. */
  siteUrl: 'https://doctool.kalanvidhi.com',
  /** Origin of the parent business website (Organization structured data and cross-links point here). */
  parentUrl: 'https://kalanvidhi.com',
  /** Written into PDFs this app creates (the PDF "Producer" field). */
  producer: 'Kalan Vidhi Doc Tool',
  themeColor: '#4f46e5',
  /**
   * Public contact address. The Contact page, its footer link and its sitemap entry only exist while this is set,
   * so the site never shows a placeholder. Set a real, monitored address to publish it.
   */
  contactEmail: '' as string,
} as const

export const titleFor = (page: string) => `${page} | ${BRAND.name}`

/**
 * The public origin used for every absolute URL. `VITE_SITE_URL` may override the production default (for a staging
 * host); unset or blank falls back to the default, so a build that forgot the variable still ships correct SEO.
 * An override that is not a bare http(s) origin throws, which fails the build instead of shipping bad canonicals.
 */
export function resolveSiteUrl(override?: string | null): string {
  const raw = (override ?? '').trim().replace(/\/+$/, '')
  if (!raw) return BRAND.siteUrl
  let url: URL
  try { url = new URL(raw) } catch { throw new Error(`VITE_SITE_URL is not a valid URL: ${JSON.stringify(raw)}`) }
  if (!/^https?:$/.test(url.protocol) || url.origin !== raw.toLowerCase()) {
    throw new Error(`VITE_SITE_URL must be a bare origin such as ${BRAND.siteUrl} (no path, query or credentials): ${JSON.stringify(raw)}`)
  }
  return url.origin
}
