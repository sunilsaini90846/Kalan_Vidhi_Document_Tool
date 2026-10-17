import { detectKind, readHead, type DetectedKind } from './signatures'

/** Picks the most useful tool for a dropped file, by content (signature) and, for packages, extension. */
export function routeFor(kind: DetectedKind, fileName: string): string | null {
  if (kind === 'jpeg' || kind === 'png' || kind === 'webp') return '/image-compressor'
  if (kind === 'gif' || kind === 'bmp' || kind === 'tiff' || kind === 'avif' || kind === 'svg' || kind === 'ico') return '/image-converter'
  if (kind === 'pdf') return '/pdf-compressor'
  if (kind === 'gzip' || kind === 'tar') return '/zip-tools'
  if (kind === 'zip') {
    const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase()
    if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') return `/${ext}-optimizer`
    if (ext === 'odt' || ext === 'ods' || ext === 'odp') return '/odf-optimizer'
    if (ext === 'epub') return '/epub-optimizer'
    return '/zip-tools'
  }
  return null
}

export async function routeForFile(file: File): Promise<string | null> {
  return routeFor(detectKind(await readHead(file)), file.name)
}
