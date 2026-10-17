export type DetectedKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf' | 'zip' | 'unknown'

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((v, i) => b[offset + i] === v)

/** Identify a file by its leading bytes (magic numbers). */
export function detectKind(head: Uint8Array): DetectedKind {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  return 'unknown'
}

export function readHead(file: Blob, length = 16): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file.slice(0, length))
  })
}
