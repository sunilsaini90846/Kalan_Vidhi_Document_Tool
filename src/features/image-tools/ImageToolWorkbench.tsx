import { useEffect, useMemo, useState } from 'react'
import { Download, Trash2, RotateCcw, X } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { btn, btnGhost } from '@/components/common/ToolPage'
import { useObjectUrls } from '@/hooks/useObjectUrls'
import { downloadBlob, zipBlobs } from '@/services/downloads/download'
import { savedPercent } from '@/services/image-processing/sizing'
import type { OutputMime } from '@/services/image-processing/process'
import { formatBytes } from '@/utils/limits'
import { useImageBatch, type BatchConfig, type BatchItem } from './useImageBatch'

export type ImageToolMode = 'compress' | 'resize' | 'convert'

const PRESETS = { 'Low Size': 0.5, Balanced: 0.75, 'High Quality': 0.9 } as const
const RULES = { accept: ['jpeg', 'png', 'webp'] } as const
const FORMATS: { label: string; value: OutputMime }[] = [
  { label: 'JPG', value: 'image/jpeg' }, { label: 'PNG', value: 'image/png' }, { label: 'WebP', value: 'image/webp' },
]
const field = 'rounded-md border border-slate-300 px-2 py-1.5'

export function ImageToolWorkbench({ mode }: { mode: ImageToolMode }) {
  const batch = useImageBatch()
  const urls = useObjectUrls()
  const [preset, setPreset] = useState<keyof typeof PRESETS>('Balanced')
  const [quality, setQuality] = useState(0.75)
  const [resizeOn, setResizeOn] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [enlarge, setEnlarge] = useState(false)
  const [format, setFormat] = useState<OutputMime>('image/webp')
  const [zipping, setZipping] = useState(false)

  const num = (s: string) => { const n = parseInt(s, 10); return n > 0 ? n : undefined }
  const sizeActive = mode === 'resize' || resizeOn
  const cfg: BatchConfig = {
    mime: mode === 'convert' ? format : 'same',
    quality,
    maxWidth: sizeActive ? num(width) : undefined,
    maxHeight: sizeActive ? num(height) : undefined,
    allowEnlarge: mode === 'resize' && enlarge,
    suffix: mode === 'compress' ? '-compressed' : mode === 'resize' ? '-resized' : '-converted',
    keepIfLarger: mode === 'compress' && !sizeActive,
  }
  const needsSize = mode === 'resize' && !cfg.maxWidth && !cfg.maxHeight

  const done = batch.items.filter((i) => i.state.status === 'done')
  const failed = batch.items.filter((i) => i.state.status === 'failed')
  const completed = done.length + failed.length
  const pending = batch.items.filter((i) => i.state.status !== 'done')

  async function downloadAll() {
    setZipping(true)
    try {
      const entries = done.map((i) => (i.state.status === 'done' ? { name: i.state.name, blob: i.state.blob } : null)).filter((e) => e !== null)
      downloadBlob(await zipBlobs(entries), `${mode}-images.zip`)
    } finally { setZipping(false) }
  }

  return (
    <div className="space-y-6">
      <FileDropzone rules={RULES} existing={batch.items.map((i) => i.file)} label="Drop JPG, PNG or WebP images here" onFiles={(f) => batch.add(f.map((v) => v.file))} />

      {batch.items.length > 0 && (
        <>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" disabled={batch.running}>
            <legend className="px-1 text-sm font-semibold">Options</legend>
            {mode === 'convert' && (
              <label className="text-sm">Output format<br />
                <select className={field} value={format} onChange={(e) => setFormat(e.target.value as OutputMime)}>{FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              </label>
            )}
            {mode !== 'resize' && (
              <div className="text-sm">
                <span>Quality: {Math.round(quality * 100)}%</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
                    <button key={p} type="button" aria-pressed={preset === p} className={`${btnGhost} ${preset === p ? 'border-brand-600 bg-brand-50' : ''}`} onClick={() => { setPreset(p); setQuality(PRESETS[p]) }}>{p}</button>
                  ))}
                </div>
                <input aria-label="Quality" type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-2 w-full" />
                <p className="text-xs text-slate-500">Applies to JPG and WebP. PNG is lossless, so quality does not change PNG size; resizing does.</p>
              </div>
            )}
            {mode === 'compress' && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resizeOn} onChange={(e) => setResizeOn(e.target.checked)} /> Also resize before compressing (default keeps dimensions)</label>
            )}
            {sizeActive && (
              <div className="text-sm">
                <div className="flex items-center gap-2">
                  <label>Max width (px)<br /><input className={`${field} w-28`} inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value)} /></label>
                  <label>Max height (px)<br /><input className={`${field} w-28`} inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
                </div>
                <p className="mt-1 text-xs text-slate-500">Aspect ratio is always kept.</p>
                {mode === 'resize' && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={enlarge} onChange={(e) => setEnlarge(e.target.checked)} /> Allow enlarging small images</label>}
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button className={btn} disabled={batch.running || pending.length === 0 || needsSize} onClick={() => void batch.run(cfg)}>
              {mode === 'compress' ? 'Compress' : mode === 'resize' ? 'Resize' : 'Convert'} {pending.length} image{pending.length === 1 ? '' : 's'}
            </button>
            {batch.running && <button className={btnGhost} onClick={batch.cancel}>Cancel</button>}
            {done.length > 1 && <button className={btnGhost} disabled={zipping} onClick={() => void downloadAll()}><Download className="mr-1 inline h-4 w-4" />Download all (ZIP)</button>}
            <button className={btnGhost} disabled={batch.running} onClick={() => { urls.revokeAll(); batch.clear() }}><Trash2 className="mr-1 inline h-4 w-4" />Clear all</button>
            {needsSize && <span className="text-sm text-amber-700">Enter a width or height.</span>}
          </div>

          {batch.running && (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={batch.items.length} aria-valuenow={completed} aria-label="Processing files" className="h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-brand-600" style={{ width: `${(completed / batch.items.length) * 100}%` }} />
            </div>
          )}
          {(done.length > 0 || failed.length > 0) && !batch.running && (
            <p role="status" className="text-sm font-medium">{done.length} succeeded{failed.length ? `, ${failed.length} failed` : ''}.</p>
          )}

          <ul className="space-y-3">
            {batch.items.map((item) => (
              <Row key={item.id} item={item} disabled={batch.running} onRemove={() => batch.remove(item.id)} onRetry={() => void batch.run(cfg, [item.id])} createUrl={urls.create} revokeUrl={urls.revoke} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Row({ item, disabled, onRemove, onRetry, createUrl, revokeUrl }: {
  item: BatchItem; disabled: boolean; onRemove: () => void; onRetry: () => void
  createUrl: (b: Blob) => string; revokeUrl: (u: string) => void
}) {
  const { state, file } = item
  const before = useMemo(() => createUrl(file), [createUrl, file])
  const resultBlob = state.status === 'done' ? state.blob : null
  const after = useMemo(() => (resultBlob ? createUrl(resultBlob) : null), [createUrl, resultBlob])
  useEffect(() => () => revokeUrl(before), [before, revokeUrl])
  useEffect(() => () => { if (after) revokeUrl(after) }, [after, revokeUrl])

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex gap-2">
        <figure><img src={before} alt={`Original ${file.name}`} loading="lazy" className="h-20 w-20 rounded bg-slate-100 object-contain" /><figcaption className="text-center text-xs text-slate-500">Before</figcaption></figure>
        {after && <figure><img src={after} alt={`Result for ${file.name}`} className="h-20 w-20 rounded bg-slate-100 object-contain" /><figcaption className="text-center text-xs text-slate-500">After</figcaption></figure>}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium">{file.name}</p>
        <p className="text-slate-600">Original: {formatBytes(file.size)}</p>
        {state.status === 'processing' && <p className="text-slate-600">Processing…</p>}
        {state.status === 'failed' && <p role="alert" className="text-red-700">{state.message}</p>}
        {state.status === 'done' && (
          <>
            <p>Result: {formatBytes(state.blob.size)} · {state.width}×{state.height}</p>
            {state.keptOriginal
              ? <p className="text-slate-600">Already well optimized: no smaller version was possible, so the original is kept.</p>
              : (() => { const p = savedPercent(file.size, state.blob.size); return p >= 0 ? <p className="text-green-700">{p.toFixed(1)}% smaller</p> : <p className="text-amber-700">{Math.abs(p).toFixed(1)}% larger than the original ({formatBytes(state.blob.size - file.size)} more)</p> })()}
          </>
        )}
      </div>
      <div className="flex gap-2">
        {state.status === 'done' && <button className={btnGhost} onClick={() => downloadBlob(state.blob, state.name)}><Download className="mr-1 inline h-4 w-4" />Download</button>}
        {state.status === 'failed' && <button className={btnGhost} disabled={disabled} onClick={onRetry}><RotateCcw className="mr-1 inline h-4 w-4" />Retry</button>}
        <button className={btnGhost} aria-label={`Remove ${file.name}`} disabled={disabled} onClick={onRemove}><X className="h-4 w-4" /></button>
      </div>
    </li>
  )
}
