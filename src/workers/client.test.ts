import { AppError } from '@/types/errors'
import { WorkerClient } from './client'

/** Minimal Worker double so the lifecycle logic can be tested without a browser. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  sent: { id: number; op: string; args: unknown }[] = []
  constructor() { FakeWorker.instances.push(this) }
  postMessage(m: { id: number; op: string; args: unknown }) { this.sent.push(m) }
  terminate() { this.terminated = true }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}

beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker) })
afterEach(() => vi.unstubAllGlobals())

describe('WorkerClient', () => {
  it('resolves with the worker result and forwards progress', async () => {
    const c = new WorkerClient(); const progress: unknown[] = []
    const p = c.run('capabilities', undefined, (x) => progress.push(x))
    const w = FakeWorker.instances[0]!
    w.reply({ id: w.sent[0]!.id, type: 'progress', progress: { done: 1, total: 2 } })
    w.reply({ id: w.sent[0]!.id, type: 'done', result: { ok: true } })
    await expect(p).resolves.toEqual({ ok: true })
    expect(progress).toEqual([{ done: 1, total: 2 }])
  })

  it('turns worker errors into AppError with the original code and message', async () => {
    const c = new WorkerClient(); const p = c.run('capabilities', undefined)
    const w = FakeWorker.instances[0]!
    w.reply({ id: w.sent[0]!.id, type: 'error', code: 'FILE_TOO_LARGE', message: 'too big' })
    await expect(p).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', message: 'too big' })
  })

  it('cancel() terminates the worker and rejects every pending job as CANCELLED', async () => {
    const c = new WorkerClient()
    const a = c.run('capabilities', undefined), b = c.run('capabilities', undefined)
    c.cancel()
    await expect(a).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(b).rejects.toBeInstanceOf(AppError)
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
  })

  it('starts a fresh worker after a cancel, and ignores late replies from the old one', async () => {
    const c = new WorkerClient()
    const first = c.run('capabilities', undefined); const old = FakeWorker.instances[0]!
    c.cancel(); await first.catch(() => undefined)
    const second = c.run('capabilities', undefined)
    expect(FakeWorker.instances).toHaveLength(2)
    old.reply({ id: old.sent[0]!.id, type: 'done', result: 'stale' }) // must not resolve the new job
    const w = FakeWorker.instances[1]!
    w.reply({ id: w.sent[0]!.id, type: 'done', result: 'fresh' })
    await expect(second).resolves.toBe('fresh')
  })

  it('a worker crash rejects pending jobs with a safe message and recovers on the next call', async () => {
    const c = new WorkerClient(); const p = c.run('capabilities', undefined)
    FakeWorker.instances[0]!.onerror?.()
    await expect(p).rejects.toMatchObject({ code: 'PROCESSING_FAILED', message: expect.stringMatching(/stopped unexpectedly/) })
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
    void c.run('capabilities', undefined)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('dispose() cancels like cancel()', async () => {
    const c = new WorkerClient(); const p = c.run('capabilities', undefined)
    c.dispose()
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
