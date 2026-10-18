import { useEffect, useMemo, useState } from 'react'
import { Download, Trash2, RotateCcw, X } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { btn, btnGhost } from '@/components/common/ToolPage'
import { useObjectUrls } from '@/hooks/useObjectUrls'
import { downloadBlob, zipBlobs } from '@/services/downloads/download'
import { rulesFor, type ToolAcceptSlug } from '@/services/formats/registry'
import type { Capabilities } from '@/services/image-processing/capabilities'
import type { ImageMode } from '@/services/image-processing/job'
import { pngColorsFor } from '@/services/image-processing/job'
import type { OutputMime } from '@/services/image-processing/process'
import { savedPercent } from '@/services/image-processing/sizing'
import { formatBytes } from '@/utils/limits'
import { useImageBatch, type BatchConfig, type BatchItem } from './useImageBatch'

export type ImageToolMode = ImageMode

const PRESETS = { 'Low Size': 0.5, Balanced: 0.75, 'High Quality': 0.9 } as const
type Preset = keyof typeof PRESETS
/** The compressor always opens on Balanced; resizing and converting default to 90% so they do not add visible loss. */
const DEFAULT_QUALITY: Record<ImageToolMode, number> = { compress: PRESETS.Balanced, resize: 0.9, convert: 0.9 }
/** The preset is derived from the quality, so the pressed button, the label and the help text can never disagree. */
const presetOf = (q: number) => (Object.keys(PRESETS) as Preset[]).find((p) => Math.abs(PRESETS[p] - q) < 0.001) ?? null
const pngSetting = (q: number) => { const n = pngColorsFor(q); return n === 0 ? 'PNG kept lossless' : `PNG reduced to ${n} colours (lossy)` }
const describeQuality = (q: number) => `JPG/WebP quality ${Math.round(q * 100)}%; ${pngSetting(q)}`
const SLUG: Record<ImageToolMode, ToolAcceptSlug> = { compress: 'image-compressor', resize: 'image-resizer', convert: 'image-converter' }
const FORMATS: { label: string; value: OutputMime }[] = [
  { label: 'JPG (lossy, no transparency)', value: 'image/jpeg' }, { label: 'PNG (lossless, keeps transparency)', value: 'image/png' }, { label: 'WebP (lossy, keeps transparency)', value: 'image/webp' },
]
const field = 'rounded-md border border-slate-300 px-2 py-1.5'

export function ImageToolWorkbench({ mode }: { mode: ImageToolMode }) {
  const batch = useImageBatch()
  const urls = useObjectUrls()
  const [quality, setQuality] = useState(DEFAULT_QUALITY[mode])
  const preset = presetOf(quality)
  const [resizeOn, setResizeOn] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [enlarge, setEnlarge] = useState(false)
  const [format, setFormat] = useState<OutputMime>('image/webp')
  const [keepFormat, setKeepFormat] = useState(true)
  const [firstFrame, setFirstFrame] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [caps, setCaps] = useState<Capabilities | null>(null)

  const { capabilities } = batch
  useEffect(() => { void capabilities().then(setCaps).catch(() => undefined) }, [capabilities])
  const canWrite = (m: OutputMime) => caps === null || caps.encode[m]
  useEffect(() => { if (!canWrite(format)) setFormat(canWrite('image/png') ? 'image/png' : 'image/jpeg') }, [caps]) // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => { const n = parseInt(s, 10); return n > 0 ? n : undefined }
  const sizeActive = mode === 'resize' || resizeOn
  const output: OutputMime | 'same' = mode === 'convert' ? format : mode === 'resize' && !keepFormat ? format : 'same'
  const cfg: BatchConfig = {
    mode, output, quality,
    maxWidth: sizeActive ? num(width) : undefined,
    maxHeight: sizeActive ? num(height) : undefined,
    allowEnlarge: mode === 'resize' && enlarge,
    suffix: mode === 'compress' ? '-compressed' : mode === 'resize' ? '-resized' : '-converted',
    allowFirstFrame: firstFrame,
  }
  const needsSize = mode === 'resize' && !cfg.maxWidth && !cfg.maxHeight

  const done = batch.items.filter((i) => i.state.status === 'done')
  const failed = batch.items.filter((i) => i.state.status === 'failed')
  const completed = done.length + failed.length
  const pending = batch.items.filter((i) => i.state.status !== 'done')
  const lossyOut = output !== 'image/png'

  async function downloadAll() {
    setZipping(true)
    try {
      const entries = done.flatMap((i) => (i.state.status === 'done' ? [{ name: i.state.result.name, blob: i.state.blob }] : []))
      downloadBlob(await zipBlobs(entries), `${mode}-images.zip`)
    } finally { setZipping(false) }
  }

  return (
    <div className="space-y-6">
      <FileDropzone rules={rulesFor(SLUG[mode])} existing={batch.items.map((i) => i.file)} label="Drop images here" onFiles={(f) => batch.add(f.map((v) => v.file))} />

      {batch.items.length > 0 && (
        <>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" disabled={batch.running}>
            <legend className="px-1 text-sm font-semibold">Options</legend>
            {mode === 'convert' && (
              <label className="text-sm">Output format<br />
                <select className={field} value={format} onChange={(e) => setFormat(e.target.value as OutputMime)}>
                  {FORMATS.map((f) => <option key={f.value} value={f.value} disabled={!canWrite(f.value)}>{f.label}{canWrite(f.value) ? '' : ' – not available in this browser'}</option>)}
                </select>
              </label>
            )}
            {mode === 'resize' && (
              <div className="text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={keepFormat} onChange={(e) => setKeepFormat(e.target.checked)} /> Keep each image’s format (GIF, BMP, TIFF, AVIF, ICO and SVG are saved as PNG)</label>
                {!keepFormat && <select aria-label="Output format" className={`${field} mt-1`} value={format} onChange={(e) => setFormat(e.target.value as OutputMime)}>
                  {FORMATS.map((f) => <option key={f.value} value={f.value} disabled={!canWrite(f.value)}>{f.label}</option>)}</select>}
              </div>
            )}
            {(mode === 'compress' || (lossyOut && mode !== 'convert') || (mode === 'convert' && lossyOut)) && (
              <div className="text-sm">
                <span>Quality: {Math.round(quality * 100)}%{mode === 'compress' && <span className="text-slate-600"> · PNG: {pngColorsFor(quality) === 0 ? 'lossless' : `${pngColorsFor(quality)} colours (lossy)`}</span>}</span>
                {mode === 'compress' && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(Object.keys(PRESETS) as Preset[]).map((p) => (
                      <button key={p} type="button" aria-pressed={preset === p} title={describeQuality(PRESETS[p])} className={`${btnGhost} ${preset === p ? 'border-brand-600 bg-brand-50' : ''}`} onClick={() => setQuality(PRESETS[p])}>{p}</button>
                    ))}
                  </div>
                )}
                <input aria-label="Quality" type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-2 w-full" />
                {mode === 'compress' && <p className="text-xs text-slate-600">{preset ?? 'Custom'}: {describeQuality(quality)}. If the first try is not smaller than your file, up to two lower JPG/WebP qualities are tried, and the quality actually used is shown. Settings start at Balanced on every visit.</p>}
                {mode !== 'compress' && <p className="text-xs text-slate-600">Applies to JPG and WebP output.</p>}
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
                <p className="mt-1 text-xs text-slate-600">Aspect ratio is always kept. Images are never enlarged unless you allow it{mode === 'resize' ? '' : ' (Resizer only)'}.</p>
                {mode === 'resize' && <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={enlarge} onChange={(e) => setEnlarge(e.target.checked)} /> Allow enlarging small images</label>}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={firstFrame} onChange={(e) => setFirstFrame(e.target.checked)} /> Use only the first frame of animated images (GIF, APNG, WebP). Otherwise animated files are refused, never silently flattened.</label>
            <p className="text-xs text-slate-600 sm:col-span-2">Results contain pixels only: EXIF, GPS and colour-profile metadata are removed, and colours are converted to sRGB. Your original files are never changed.</p>
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
            <div role="progressbar" aria-valuemin={0} aria-valuemax={batch.items.length} aria-valuenow={completed} aria-label={`Processing files: ${completed} of ${batch.items.length} finished`} className="h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-brand-600" style={{ width: `${(completed / batch.items.length) * 100}%` }} />
            </div>
          )}
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {!batch.running && (done.length > 0 || failed.length > 0) ? `${done.length} succeeded${failed.length ? `, ${failed.length} failed` : ''}.` : ''}
          </p>

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
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex gap-2">
        <figure><img src={before} alt={`Original ${file.name}`} loading="lazy" className="h-20 w-20 rounded bg-slate-100 object-contain" /><figcaption className="text-center text-xs text-slate-600">Before</figcaption></figure>
        {after && <figure><img src={after} alt={`Result for ${file.name}`} className="h-20 w-20 rounded bg-slate-100 object-contain" /><figcaption className="text-center text-xs text-slate-600">After</figcaption></figure>}
      </div>
      <div className="min-w-0 w-full text-sm sm:flex-1">
        <p className="truncate font-medium">{file.name}</p>
        <p className="text-slate-600">Original: {formatBytes(file.size)}</p>
        {state.status === 'queued' && <p className="text-slate-600">Waiting</p>}
        {state.status === 'processing' && <p className="text-slate-600">Processing…</p>}
        {state.status === 'failed' && <p role="alert" className="text-red-700">{state.message}</p>}
        {state.status === 'done' && (
          <>
            {state.keptOriginal
              ? <p>Result: {state.result.width}×{state.result.height} · Already well optimized: no smaller version was possible, so the original is kept (0% saved).</p>
              : <p>Result: {formatBytes(state.blob.size)} · {state.result.width}×{state.result.height} · {state.result.method}</p>}
            {!state.keptOriginal && (() => { const p = savedPercent(file.size, state.blob.size); return p >= 0 ? <p className="text-green-700">{p.toFixed(1)}% smaller</p> : <p className="text-amber-700">{Math.abs(p).toFixed(1)}% larger than the original ({formatBytes(state.blob.size - file.size)} more)</p> })()}
            {state.result.notes.map((n) => <p key={n} className="text-amber-800">Note: {n}</p>)}
          </>
        )}
      </div>
      <div className="flex gap-2">
        {state.status === 'done' && <button className={btnGhost} onClick={() => downloadBlob(state.blob, state.result.name)}><Download className="mr-1 inline h-4 w-4" />Download</button>}
        {state.status === 'failed' && <button className={btnGhost} disabled={disabled} onClick={onRetry}><RotateCcw className="mr-1 inline h-4 w-4" />Retry</button>}
        <button className={btnGhost} aria-label={`Remove ${file.name}`} disabled={disabled} onClick={onRemove}><X className="h-4 w-4" /></button>
      </div>
    </li>
  )
}
