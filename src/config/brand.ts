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
} as const

export const titleFor = (page: string) => `${page} | ${BRAND.name}`
