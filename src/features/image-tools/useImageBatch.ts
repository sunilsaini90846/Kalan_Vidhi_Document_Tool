import { useCallback, useRef, useState } from 'react'
import { useWorker } from '@/hooks/useWorker'
import { detectKind, readHead } from '@/services/file-validation/signatures'
import type { ImageJobResult, ImageMode } from '@/services/image-processing/job'
import type { OutputMime } from '@/services/image-processing/process'
import { rasterizeSvg } from '@/services/image-processing/svg'
import { AppError, toUserMessage } from '@/types/errors'

export type ItemState =
  | { status: 'queued' }
  | { status: 'processing' }
  | { status: 'done'; blob: Blob; result: ImageJobResult; keptOriginal: boolean }
  | { status: 'failed'; message: string }

export interface BatchItem { id: string; file: File; state: ItemState }
export interface BatchConfig {
  mode: ImageMode
  output: OutputMime | 'same'
  quality: number
  maxWidth?: number
  maxHeight?: number
  allowEnlarge: boolean
  suffix: string
  allowFirstFrame: boolean
}

let counter = 0

/**
 * Processes one file at a time (bounded concurrency of 1): a batch never holds more than one decoded image in
 * memory. SVGs are rasterized on the main thread first because workers cannot load SVG images.
 */
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
        let input = item.file
        const notes: string[] = []
        if (detectKind(await readHead(input)) === 'svg') {
          input = await rasterizeSvg(input, { maxWidth: cfg.maxWidth, maxHeight: cfg.maxHeight })
          notes.push('SVG was rasterized (vector detail is not kept in PNG/WebP/JPG).')
        }
        const r = await client.run('processImage', { file: input, ...cfg, allowEnlarge: cfg.allowEnlarge || input !== item.file })
        const result = { ...r, notes: [...notes, ...r.notes] }
        patch(item.id, { status: 'done', blob: r.keptOriginal ? item.file : r.blob!, result, keptOriginal: r.keptOriginal })
      } catch (e) {
        if (e instanceof AppError && e.code === 'CANCELLED') patch(item.id, { status: 'queued' })
        else patch(item.id, { status: 'failed', message: toUserMessage(e) })
      }
    }
    setRunning(false)
  }, [items, client])

  const capabilities = useCallback(() => client.run('capabilities', undefined), [client])
  return { items, running, add, remove, clear, cancel, run, capabilities }
}
