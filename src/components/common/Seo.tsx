import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BRAND, titleFor } from '@/config/brand'

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.content = content
}

export function Seo({ title, description, noindex = false }: { title: string; description: string; noindex?: boolean }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const full = titleFor(title)
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', BRAND.name)
    setMeta('name', 'robots', noindex ? 'noindex' : 'index, follow')
    if (SITE) {
      const url = SITE + (pathname === '/' ? '/' : pathname)
      setMeta('property', 'og:url', url)
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }
      link.href = url
    }
  }, [title, description, pathname, noindex])
  return null
}
