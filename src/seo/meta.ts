/**
 * Single source for what search engines and link previews see, per route. Pure (no React, no DOM) so the same
 * module feeds the client-side `Seo` component and the build step (scripts/postbuild.mjs) that writes one static
 * HTML file per route; crawlers that do not run JavaScript only ever see that static HTML.
 */
import { BRAND, titleFor } from '@/config/brand'
import { availableTools } from '@/tools/registry'
import { TOOL_SEO } from './tool-seo'

export interface PageSeo {
  path: string
  /** Full document title, brand included. */
  title: string
  description: string
  /** Heading used in the no-JavaScript fallback. */
  heading: string
  kind: 'home' | 'tools' | 'tool' | 'static'
}

const STATIC: Array<Omit<PageSeo, 'kind' | 'title'> & { page: string }> = [
  { path: '/privacy', page: 'Privacy', heading: 'Privacy', description: `How ${BRAND.name} handles your files and data.` },
  { path: '/terms', page: 'Terms', heading: 'Terms', description: `Terms of use for ${BRAND.name}.` },
  { path: '/about', page: 'About', heading: 'About', description: `About ${BRAND.name}.` },
  ...(BRAND.contactEmail ? [{ path: '/contact', page: 'Contact', heading: 'Contact', description: `Contact ${BRAND.name}.` }] : []),
]

/** Every indexable route, in sitemap order. `/404` is deliberately absent. */
export function allPages(): PageSeo[] {
  return [
    { path: '/', kind: 'home', title: `${BRAND.name} – ${BRAND.tagline}`, heading: BRAND.tagline, description: BRAND.description },
    { path: '/tools', kind: 'tools', title: titleFor('All tools'), heading: 'All tools', description: 'Browse free image, PDF, document and archive tools that run in your browser.' },
    ...availableTools().map((t): PageSeo => {
      const s = TOOL_SEO[t.slug]
      return { path: `/${t.slug}`, kind: 'tool', title: titleFor(s?.title ?? t.name), heading: t.name, description: s?.description ?? t.description }
    }),
    ...STATIC.map(({ page, ...p }): PageSeo => ({ ...p, kind: 'static', title: titleFor(page) })),
  ]
}

export const seoForPath = (pathname: string): PageSeo | undefined => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return allPages().find((p) => p.path === path)
}

type Json = Record<string, unknown>

/** schema.org data for a page. Needs absolute URLs, so it is empty until the site URL is known. */
export function jsonLdFor(page: PageSeo, site: string): Json[] {
  if (!site) return []
  const url = site + (page.path === '/' ? '/' : page.path)
  const org: Json = { '@type': 'Organization', name: BRAND.parent, url: `${site}/`, logo: `${site}/icon-512.png` }
  const crumb = (items: Array<[string, string]>): Json => ({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: site + path })),
  })

  if (page.kind === 'home') {
    return [{ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND.name, url: `${site}/`, description: page.description, inLanguage: 'en', publisher: org }]
  }
  if (page.kind === 'tools') {
    return [
      crumb([['Home', '/'], ['All tools', '/tools']]),
      { '@context': 'https://schema.org', '@type': 'ItemList', name: 'All tools', itemListElement: availableTools().map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: `${site}/${t.slug}` })) },
    ]
  }
  if (page.kind === 'tool') {
    return [
      crumb([['Home', '/'], ['All tools', '/tools'], [page.heading, page.path]]),
      {
        // No rating or review data: there is none, and it must not be invented.
        '@context': 'https://schema.org', '@type': 'WebApplication', name: page.heading, url, description: page.description,
        applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', inLanguage: 'en', isAccessibleForFree: true,
        browserRequirements: 'Requires JavaScript and a current browser with Web Worker support',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: org,
      },
    ]
  }
  return []
}

/** JSON safe to place inside a <script> element (no way to close the tag early). */
export const serializeJsonLd = (data: Json) => JSON.stringify(data).replace(/</g, '\\u003c')
