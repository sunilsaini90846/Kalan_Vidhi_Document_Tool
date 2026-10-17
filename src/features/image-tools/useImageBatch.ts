import { useCallback, useRef, useState } from 'react'
import { useWorker } from '@/hooks/useWorker'
import type { OutputMime } from '@/services/image-processing/process'
import { AppError, toUserMessage } from '@/types/errors'

export type ItemState =
  | { status: 'queued' }
  | { status: 'processing' }
  | { status: 'done'; blob: Blob; name: string; width: number; height: number; keptOriginal: boolean }
  | { status: 'failed'; message: string }

export interface BatchItem { id: string; file: File; state: ItemState }
export interface BatchConfig {
  mime: OutputMime | 'same'
  quality: number
  maxWidth?: number
  maxHeight?: number
  allowEnlarge: boolean
  suffix: string
  /** Keep the original when re-encoding does not make it smaller (compression only). */
  keepIfLarger: boolean
}

let counter = 0

export function useImageBatch() {
  const client = useWorker()
  const [items, setItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)
  const cancelled = useRef(false)

  const add = useCallback((files: File[]) =>
    setItems((cur) => [...cur, ...files.map((file) => ({ id: `i${++counter}`, file, state: { status: 'queued' } as ItemState }))]), [])
  const remove = useCallback((id: string) => setItems((c) => c.filter((i) => i.id !== id)), [])
  const clear = useCallback(() => setItems([]), [])
  const cancel = useCallback(() => { cancelled.current = true; client.cancel() }, [client])
  const patch = (id: string, state: ItemState) => setItems((c) => c.map((i) => (i.id === id ? { ...i, state } : i)))

  const run = useCallback(async (cfg: BatchConfig, only?: string[]) => {
    cancelled.current = false
    setRunning(true)
    const targets = items.filter((i) => (only ? only.includes(i.id) : i.state.status !== 'done'))
    for (const item of targets) {
      if (cancelled.current) { patch(item.id, { status: 'queued' }); continue }
      patch(item.id, { status: 'processing' })
      try {
        const r = await client.run('processImage', { file: item.file, ...cfg })
        patch(item.id, r.keptOriginal
          ? { status: 'done', blob: item.file, name: r.name, width: r.width, height: r.height, keptOriginal: true }
          : { status: 'done', blob: r.blob, name: r.name, width: r.width, height: r.height, keptOriginal: false })
      } catch (e) {
        if (e instanceof AppError && e.code === 'CANCELLED') patch(item.id, { status: 'queued' })
        else patch(item.id, { status: 'failed', message: toUserMessage(e) })
      }
    }
    setRunning(false)
  }, [items, client])

  return { items, running, add, remove, clear, cancel, run }
}
