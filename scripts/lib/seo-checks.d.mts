export interface SeoPage { path: string; kind: string; title: string; description: string }
export interface SeoCtx { site: string; parentUrl: string; pages: SeoPage[]; notFound: SeoPage }
export const SITEMAP_NS: string
export function parseXml(xml: string): Document
export function checkSitemap(xml: string, ctx: { site: string; paths: string[] }): string[]
export function checkRobots(text: string, ctx: { site: string }): string[]
export function checkRouteHtml(html: string, ctx: { site: string; parentUrl: string; page: SeoPage }): string[]
export function checkNotFoundHtml(html: string): string[]
export function checkUniqueCopy(pages: SeoPage[]): string[]
export function checkDist(dist: string, ctx: SeoCtx): string[]
