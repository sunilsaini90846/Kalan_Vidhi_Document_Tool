/// <reference lib="webworker" />
import { AppError, toUserMessage } from '@/types/errors'
import { handlers, type OpName } from './handlers'

type Request = { id: number; op: OpName; args: unknown }

function transferables(result: unknown): Transferable[] {
  const out: Transferable[] = []
  const add = (v: unknown) => { if (v instanceof Uint8Array && v.buffer instanceof ArrayBuffer && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength) out.push(v.buffer) }
  add(result)
  if (result && typeof result === 'object') Object.values(result).forEach(add)
  return out
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, op, args } = e.data
  try {
    const fn = handlers[op] as (a: unknown, p: (v: unknown) => void) => unknown
    const result = await fn(args, (progress) => self.postMessage({ id, type: 'progress', progress }))
    self.postMessage({ id, type: 'done', result }, transferables(result))
  } catch (err) {
    self.postMessage({ id, type: 'error', code: err instanceof AppError ? err.code : 'PROCESSING_FAILED', message: toUserMessage(err) })
  }
}
