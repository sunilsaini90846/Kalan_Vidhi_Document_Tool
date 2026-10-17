import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, GripVertical, RotateCw, Trash2, X } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { useObjectUrls } from '@/hooks/useObjectUrls'
import { downloadBlob } from '@/services/downloads/download'
import { useWorker } from '@/hooks/useWorker'
import { computeCells, imagesPerPage, pageCount, pageSize, MM_TO_PT, type FitMode, type Orientation, type PagePreset, type PageSettings } from '@/services/pdf-processing/layout'
import { AppError, toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'

type Rotation = 0 | 90 | 180 | 270
interface Item { id: string; file: File; rotate: Rotation }
type Result = { status: 'idle' } | { status: 'working'; done: number } | { status: 'failed'; message: string } | { status: 'done'; blob: Blob; url: string; pages: number }

const RULES = { accept: ['jpeg', 'png', 'webp'] } as const
const field = 'rounded-md border border-slate-300 px-2 py-1.5'
const QUALITY = { 'Smaller file (JPEG 75%)': 0.75, 'Balanced (JPEG 90%)': 0.9, 'Lossless (PNG, larger)': 1 } as const
const RESIZE = { 'Original size': 0, 'Max 2480 px (≈A4 300 dpi)': 2480, 'Max 1754 px (≈A4 150 dpi)': 1754 } as const
let n = 0

export default function ImageToPdfPage() {
  const urls = useObjectUrls()
  const client = useWorker()
  const [items, setItems] = useState<Item[]>([])
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [preset, setPreset] = useState<PagePreset>('a4')
  const [custom, setCustom] = useState({ width: '210', height: '297' })
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [marginMm, setMarginMm] = useState(10)
  const [cols, setCols] = useState(1)
  const [rows, setRows] = useState(1)
  const [spacingMm, setSpacingMm] = useState(5)
  const [fit, setFit] = useState<FitMode>('fit')
  const [quality, setQuality] = useState<number>(0.9)
  const [maxDim, setMaxDim] = useState<number>(0)
  const [filename, setFilename] = useState('images')
  const [result, setResult] = useState<Result>({ status: 'idle' })

  const settings: PageSettings = {
    preset, orientation, fit, cols, rows,
    customMm: { width: Number(custom.width) || 210, height: Number(custom.height) || 297 },
    marginPt: marginMm * MM_TO_PT, spacingPt: spacingMm * MM_TO_PT,
  }
  const layoutError = useMemo(() => { try { computeCells(settings); return null } catch (e) { return (e as Error).message } }, [settings.marginPt, settings.spacingPt, cols, rows, preset, orientation, custom.width, custom.height]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = items.reduce((s, i) => s + i.file.size, 0)
  const pages = pageCount(items.length, settings)

  const dropResult = () => setResult((r) => { if (r.status === 'done') urls.revoke(r.url); return { status: 'idle' } })
  const update = (fn: (c: Item[]) => Item[]) => { dropResult(); setItems(fn) }
  const move = (from: number, to: number) => update((c) => {
    if (to < 0 || to >= c.length) return c
    const next = [...c]; const [m] = next.splice(from, 1); next.splice(to, 0, m!); return next
  })

  async function generate() {
    setResult({ status: 'working', done: 0 })
    try {
      const built = await client.run('imagesToPdf', {
        files: items.map((i) => i.file), rotations: items.map((i) => i.rotate), settings,
        quality, maxDimension: maxDim || undefined, title: filename,
      }, (p) => setResult({ status: 'working', done: p.done }))
      const blob = new Blob([built.bytes as BlobPart], { type: 'application/pdf' })
      setResult({ status: 'done', blob, url: urls.create(blob), pages: built.pageCount })
    } catch (e) {
      setResult(e instanceof AppError && e.code === 'CANCELLED' ? { status: 'idle' } : { status: 'failed', message: toUserMessage(e) })
    }
  }

  const [pw, ph] = pageSize(settings)
  const cells = layoutError ? [] : computeCells(settings)
  const pdfName = `${filename.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_') || 'images'}.pdf`
  const busy = result.status === 'working'

  return (
    <ToolPage title="Image to PDF" description="Combine JPG, PNG and WebP images into one PDF. Reorder, rotate, choose page size and layout. Everything runs in your browser."
      about={<>
        <p>Images are placed on pages in the order shown, one per page by default, or in a grid. “Fit” keeps the whole image visible; “Fill” crops the image to cover its area.</p>
        <p>Transparent areas become white. JPEG output is smaller; lossless PNG keeps exact pixels but makes bigger PDFs. Cropping a selected region is not available yet.</p>
        <p>Your images are not uploaded; the PDF is built on your device and checked (it is re-opened and its page count verified) before the download button appears.</p></>}>
      <div className="space-y-6">
        <FileDropzone rules={RULES} existing={items.map((i) => i.file)} label={items.length ? 'Add more images' : 'Drop JPG, PNG or WebP images here'}
          onFiles={(f) => update((c) => [...c, ...f.map((v) => ({ id: `p${++n}`, file: v.file, rotate: 0 as Rotation }))])} />

        {items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p role="status">{items.length} image{items.length === 1 ? '' : 's'} · {formatBytes(total)} input · {layoutError ? '—' : pages} page{pages === 1 ? '' : 's'}</p>
              <button className={btnGhost} disabled={busy} onClick={() => { update(() => []) }}><Trash2 className="mr-1 inline h-4 w-4" />Clear all</button>
            </div>
            <ol className="space-y-2" aria-label="Selected images, in page order">
              {items.map((it, i) => (
                <li key={it.id} draggable={!busy} onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragFrom !== null) move(dragFrom, i); setDragFrom(null) }}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                  <GripVertical aria-hidden className="h-5 w-5 shrink-0 cursor-grab text-slate-400" />
                  <span className="w-6 text-center text-sm text-slate-500">{i + 1}</span>
                  <Thumb file={it.file} rotate={it.rotate} create={urls.create} revoke={urls.revoke} />
                  <div className="min-w-0 flex-1 text-sm"><p className="truncate font-medium">{it.file.name}</p><p className="text-slate-600">{formatBytes(it.file.size)}{it.rotate ? ` · rotated ${it.rotate}°` : ''}</p></div>
                  <div className="flex gap-1">
                    <button className={btnGhost} aria-label={`Move ${it.file.name} up`} disabled={busy || i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="h-4 w-4" /></button>
                    <button className={btnGhost} aria-label={`Move ${it.file.name} down`} disabled={busy || i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="h-4 w-4" /></button>
                    <button className={btnGhost} aria-label={`Rotate ${it.file.name}`} disabled={busy} onClick={() => update((c) => c.map((x) => (x.id === it.id ? { ...x, rotate: ((x.rotate + 90) % 360) as Rotation } : x)))}><RotateCw className="h-4 w-4" /></button>
                    <button className={btnGhost} aria-label={`Remove ${it.file.name}`} disabled={busy} onClick={() => update((c) => c.filter((x) => x.id !== it.id))}><X className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ol>

            <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3" disabled={busy}>
              <legend className="px-1 text-sm font-semibold">Page and output settings</legend>
              <label className="text-sm">Page size<br /><select className={field} value={preset} onChange={(e) => { dropResult(); setPreset(e.target.value as PagePreset) }}>
                <option value="a4">A4</option><option value="a3">A3</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="custom">Custom (mm)</option></select></label>
              {preset === 'custom' && (
                <div className="flex gap-2 text-sm">
                  <label>Width mm<br /><input className={`${field} w-24`} inputMode="numeric" value={custom.width} onChange={(e) => { dropResult(); setCustom({ ...custom, width: e.target.value }) }} /></label>
                  <label>Height mm<br /><input className={`${field} w-24`} inputMode="numeric" value={custom.height} onChange={(e) => { dropResult(); setCustom({ ...custom, height: e.target.value }) }} /></label>
                </div>
              )}
              <label className="text-sm">Orientation<br /><select className={field} value={orientation} onChange={(e) => { dropResult(); setOrientation(e.target.value as Orientation) }}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label className="text-sm">Image placement<br /><select className={field} value={fit} onChange={(e) => { dropResult(); setFit(e.target.value as FitMode) }}><option value="fit">Fit (keep whole image)</option><option value="fill">Fill (crop to cover)</option></select></label>
              <label className="text-sm">Margin (mm)<br /><input type="number" min={0} max={50} className={`${field} w-24`} value={marginMm} onChange={(e) => { dropResult(); setMarginMm(Math.max(0, Number(e.target.value))) }} /></label>
              <label className="text-sm">Images per page (columns × rows)<br />
                <span className="flex items-center gap-1"><input aria-label="Columns" type="number" min={1} max={4} className={`${field} w-16`} value={cols} onChange={(e) => { dropResult(); setCols(Math.min(4, Math.max(1, Number(e.target.value) || 1))) }} />×
                  <input aria-label="Rows" type="number" min={1} max={4} className={`${field} w-16`} value={rows} onChange={(e) => { dropResult(); setRows(Math.min(4, Math.max(1, Number(e.target.value) || 1))) }} /> = {imagesPerPage(settings)}</span></label>
              {imagesPerPage(settings) > 1 && <label className="text-sm">Spacing (mm)<br /><input type="number" min={0} max={30} className={`${field} w-24`} value={spacingMm} onChange={(e) => { dropResult(); setSpacingMm(Math.max(0, Number(e.target.value))) }} /></label>}
              <label className="text-sm">Image quality<br /><select className={field} value={quality} onChange={(e) => { dropResult(); setQuality(Number(e.target.value)) }}>{Object.entries(QUALITY).map(([l, v]) => <option key={l} value={v}>{l}</option>)}</select></label>
              <label className="text-sm">Resize before embedding<br /><select className={field} value={maxDim} onChange={(e) => { dropResult(); setMaxDim(Number(e.target.value)) }}>{Object.entries(RESIZE).map(([l, v]) => <option key={l} value={v}>{l}</option>)}</select></label>
              <label className="text-sm">PDF filename<br /><input className={field} value={filename} onChange={(e) => setFilename(e.target.value)} /></label>
            </fieldset>
            {layoutError && <p role="alert" className="text-sm text-red-700">{layoutError}</p>}

            {!layoutError && (
              <div aria-label="Page layout preview" role="img" className="relative mx-auto bg-white shadow ring-1 ring-slate-300" style={{ width: Math.min(220, (220 * pw) / ph), aspectRatio: `${pw}/${ph}` }}>
                {cells.map((c, i) => (
                  <div key={i} className="absolute grid place-items-center bg-brand-100 text-xs text-brand-700" style={{ left: `${(c.x / pw) * 100}%`, top: `${(c.y / ph) * 100}%`, width: `${(c.width / pw) * 100}%`, height: `${(c.height / ph) * 100}%` }}>{i < items.length ? i + 1 : ''}</div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button className={btn} disabled={busy || !!layoutError} onClick={() => void generate()}>{busy ? 'Creating PDF…' : 'Create PDF'}</button>
              {busy && <button className={btnGhost} onClick={() => client.cancel()}>Cancel</button>}
              {result.status === 'working' && <progress className="h-2 w-48" max={items.length} value={result.done} aria-label="Preparing images" />}
              {result.status === 'done' && (
                <button className={btn} onClick={() => downloadBlob(result.blob, pdfName)}><Download className="mr-1 inline h-4 w-4" />Download {pdfName}</button>
              )}
            </div>
            {result.status === 'failed' && <p role="alert" className="text-sm text-red-700">{result.message}</p>}
            {result.status === 'done' && (
              <p role="status" className="text-sm text-green-700">PDF ready and verified: {result.pages} page{result.pages === 1 ? '' : 's'}, {formatBytes(result.blob.size)} (input {formatBytes(total)}).</p>
            )}
          </>
        )}
      </div>
    </ToolPage>
  )
}

function Thumb({ file, rotate, create, revoke }: { file: File; rotate: number; create: (b: Blob) => string; revoke: (u: string) => void }) {
  const url = useMemo(() => create(file), [create, file])
  useCleanup(url, revoke)
  return <img src={url} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded bg-slate-100 object-contain transition-transform" style={{ transform: `rotate(${rotate}deg)` }} />
}
import { useEffect } from 'react'
function useCleanup(url: string, revoke: (u: string) => void) { useEffect(() => () => revoke(url), [url, revoke]) }
