import { makeCanvas, type OutputMime } from './process'

export interface Capabilities {
  encode: Record<OutputMime, boolean>
  decode: Record<'webp' | 'gif' | 'bmp' | 'avif' | 'ico', boolean>
}

/** 1×1 genuine files, generated with sharp / written by hand, used to ask the browser "can you decode this?". */
const PROBES: Record<keyof Capabilities['decode'], { b64: string; mime: string }> = {
  webp: { mime: 'image/webp', b64: 'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+91kv/kFpXLeAP/4yp8ZU+Mqf8XMAAAA=' },
  gif: { mime: 'image/gif', b64: 'R0lGODlhAQABAIAAAExpccwAACH5BAUAAAAALAAAAAABAAEAAAICTAEAOw==' },
  bmp: { mime: 'image/bmp', b64: 'Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAADMAA==' },
  ico: { mime: 'image/x-icon', b64: 'AAABAAEAAQEAAAEAIABaAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAABAAAAAQgCAAAAkHdT3gAAAAlwSFlzAAAD6AAAA+gBtXtSawAAAAxJREFUCJljOMPAAAACaADNcP+x2AAAAABJRU5ErkJggg==' },
  avif: { mime: 'image/avif', b64: 'AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACQAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAsbWRhdBIACgc4AAaQENBpMhcZQmMEwAA0AACQQMkcYUR20rWycvH0oA==' },
}

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function canDecode(k: keyof typeof PROBES): Promise<boolean> {
  try { (await createImageBitmap(new Blob([bytes(PROBES[k].b64)], { type: PROBES[k].mime }))).close(); return true } catch { return false }
}

async function canEncode(mime: OutputMime): Promise<boolean> {
  try {
    const c = makeCanvas(2, 2)
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null
    if (!ctx) return false
    ctx.fillStyle = '#c00'; ctx.fillRect(0, 0, 2, 2) // a canvas with no drawn content may refuse to encode
    const blob = 'convertToBlob' in c ? await c.convertToBlob({ type: mime }) : await new Promise<Blob | null>((r) => c.toBlob(r, mime))
    return !!blob && blob.type === mime && blob.size > 0
  } catch { return false }
}

let cached: Promise<Capabilities> | null = null
/** Feature detection by actually trying, never by user-agent. Cached per worker. */
export function detectCapabilities(): Promise<Capabilities> {
  cached ??= (async () => {
    const [jpeg, png, webpEnc] = await Promise.all([canEncode('image/jpeg'), canEncode('image/png'), canEncode('image/webp')])
    const keys = Object.keys(PROBES) as (keyof typeof PROBES)[]
    const dec = await Promise.all(keys.map(canDecode))
    return { encode: { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webpEnc }, decode: Object.fromEntries(keys.map((k, i) => [k, dec[i]!])) as Capabilities['decode'] }
  })()
  return cached
}
