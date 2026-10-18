/** Single source of truth for the product name. Change it here, not in components. */
export const BRAND = {
  parent: 'Kalan Vidhi',
  product: 'Doc Tool',
  name: 'Kalan Vidhi Doc Tool',
  tagline: 'Free, private file compression and conversion',
  description: 'Free, private tools to compress and convert images, PDFs, Office documents and archives. Supported tools run in your browser with no sign-up.',
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
