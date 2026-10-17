import { detectKind, readHead } from './signatures'

const OFFICE = /\.(docx|pptx|xlsx)$/i

/** Picks the most useful tool for a dropped file, by content (signature) and, for Office files, extension. */
export function routeFor(kind: ReturnType<typeof detectKind>, fileName: string): string | null {
  if (kind === 'jpeg' || kind === 'png' || kind === 'webp') return '/image-compressor'
  if (kind === 'pdf') return '/pdf-compressor'
  if (kind === 'zip') {
    const m = OFFICE.exec(fileName)
    return m ? `/${m[1]!.toLowerCase()}-optimizer` : '/zip-tools'
  }
  return null
}

export async function routeForFile(file: File): Promise<string | null> {
  return routeFor(detectKind(await readHead(file)), file.name)
}
