import { AppError, type AppErrorCode } from '@/types/errors'
import type { Handlers, OpName } from './handlers'

type Arg<K extends OpName> = Parameters<Handlers[K]>[0]
type Result<K extends OpName> = Awaited<ReturnType<Handlers[K]>>
type ProgressInfo = { done: number; total: number }
type Pending = { resolve: (v: never) => void; reject: (e: unknown) => void; onProgress?: (p: ProgressInfo) => void }

/**
 * Runs heavy operations in a dedicated module worker so the page stays responsive.
 * `cancel()` terminates the worker, which actually stops the work; a fresh worker starts on the next call.
 */
export class WorkerClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private seq = 0

  private ensure(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('./tasks.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; type: string; result?: never; progress?: ProgressInfo; code?: AppErrorCode; message?: string }
      const p = this.pending.get(m.id)
      if (!p) return
      if (m.type === 'progress') p.onProgress?.(m.progress!)
      else {
        this.pending.delete(m.id)
        if (m.type === 'done') p.resolve(m.result as never)
        else p.reject(new AppError(m.code ?? 'PROCESSING_FAILED', m.message ?? 'Processing failed.'))
      }
    }
    w.onerror = () => this.fail(new AppError('PROCESSING_FAILED', 'Processing stopped unexpectedly. The file may be too large for this browser.'))
    this.worker = w
    return w
  }

  run<K extends OpName>(op: K, args: Arg<K>, onProgress?: (p: ProgressInfo) => void): Promise<Result<K>> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, onProgress })
      try { this.ensure().postMessage({ id, op, args }) } catch { this.pending.delete(id); reject(new AppError('PROCESSING_FAILED', 'This file could not be sent for processing.')) }
    })
  }

  private fail(err: AppError) {
    const all = [...this.pending.values()]
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
    all.forEach((p) => p.reject(err))
  }

  cancel() { this.fail(new AppError('CANCELLED', 'Cancelled.')) }
  dispose() { this.cancel() }
}
