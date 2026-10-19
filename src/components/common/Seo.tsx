import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BRAND, titleFor } from '@/config/brand'
import { jsonLdFor, seoForPath, serializeJsonLd } from '@/seo/meta'

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.content = content
}

/**
 * Routed pages take their title and description from src/seo/meta.ts (the same data the build writes into each
 * route's static HTML). Props only matter for pages outside that list, such as the 404 page.
 */
export function Seo({ title, description, noindex = false }: { title?: string; description?: string; noindex?: boolean }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const page = noindex ? undefined : seoForPath(pathname)
    const full = page?.title ?? titleFor(title ?? BRAND.name)
    const desc = page?.description ?? description ?? BRAND.description
    document.title = full
    setMeta('name', 'description', desc)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', BRAND.name)
    setMeta('name', 'twitter:title', full)
    setMeta('name', 'twitter:description', desc)
    setMeta('name', 'robots', noindex ? 'noindex' : 'index, follow')
    if (SITE) {
      const url = SITE + (page?.path ?? pathname)
      setMeta('property', 'og:url', url)
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }
      link.href = url
    }
    // Replace the structured data left by the previous page (or by the static HTML) so exactly one set is present.
    document.head.querySelectorAll('script[data-seo]').forEach((n) => n.remove())
    for (const data of page ? jsonLdFor(page, SITE) : []) {
      const el = document.createElement('script')
      el.type = 'application/ld+json'
      el.dataset.seo = ''
      el.textContent = serializeJsonLd(data)
      document.head.appendChild(el)
    }
  }, [title, description, pathname, noindex])
  return null
}
