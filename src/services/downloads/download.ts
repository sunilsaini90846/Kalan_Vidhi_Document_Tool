import { zipSync } from 'fflate'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Make names unique within one archive: a.png, a (2).png … */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>()
  return names.map((n) => {
    const key = n.toLowerCase()
    const count = (used.get(key) ?? 0) + 1
    used.set(key, count)
    if (count === 1) return n
    const dot = n.lastIndexOf('.')
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`
  })
}

/** Already-compressed media gains nothing from deflate, so entries are stored. */
export async function zipBlobs(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const names = uniqueNames(entries.map((e) => e.name))
  const files: Record<string, Uint8Array> = {}
  for (const [i, e] of entries.entries()) files[names[i]!] = new Uint8Array(await readBlob(e.blob))
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' })
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
}
