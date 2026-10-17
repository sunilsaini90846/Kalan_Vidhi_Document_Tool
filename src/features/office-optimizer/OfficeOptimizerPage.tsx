import { useState } from 'react'
import { Download } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { useWorker } from '@/hooks/useWorker'
import { downloadBlob } from '@/services/downloads/download'
import { PRESETS, type CompressPreset } from '@/services/image-processing/presets'
import { savedPercent } from '@/services/image-processing/sizing'
import { MACRO_EXTENSIONS, OFFICE, formatFromName, type OfficeFormat } from '@/services/office-processing/formats'
import type { OfficeInfo } from '@/services/office-processing/inspect'
import type { OfficeReport } from '@/services/office-processing/optimize'
import { AppError, toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'

const DETAIL: Record<CompressPreset, string> = {
  light: 'JPEG images re-encoded at 85% quality; pixel dimensions kept; PNGs untouched.',
  balanced: 'JPEG quality 70%; JPEG and PNG images over 2000 px downscaled.',
  strong: 'JPEG quality 50%; JPEG and PNG images over 1400 px downscaled. Visible quality loss.',
}

interface Loaded { file: File; bytes: Uint8Array; info: OfficeInfo; format: OfficeFormat }

const list = (fs: readonly OfficeFormat[]) => fs.map((f) => f.toUpperCase()).join(', ')

export function OfficeOptimizerPage({ formats }: { formats: readonly OfficeFormat[] }) {
  const title = `${formats.length === 1 ? formats[0]!.toUpperCase() : formats[0]!.startsWith('od') ? 'ODF' : formats[0]!.toUpperCase()} Optimizer`
  const family = OFFICE[formats[0]!].family
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<CompressPreset>('balanced')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [report, setReport] = useState<OfficeReport | null>(null)
  const client = useWorker()

  async function select(file: File) {
    setError(null); setReport(null); setLoaded(null)
    try {
      if (MACRO_EXTENSIONS.test(file.name)) throw new AppError('PROCESSING_FAILED', 'Macro-enabled files (DOCM, XLSM, PPTM) are not supported.')
      const format = formatFromName(file.name, formats)
      if (!format) throw new AppError('PROCESSING_FAILED', `Please choose a ${formats.map((f) => `.${f}`).join(' / ')} file.`)
      const bytes = new Uint8Array(await file.arrayBuffer())
      setLoaded({ file, bytes, format, info: await client.run('inspectOffice', { bytes: bytes, format, name: file.name }) })
    } catch (e) { setError(toUserMessage(e)) }
  }

  async function run() {
    if (!loaded) return
    setBusy(true); setError(null); setReport(null); setProgress(null)
    try { setReport(await client.run('optimizeOffice', { bytes: loaded.bytes, format: loaded.format, name: loaded.file.name, preset }, setProgress)) }
    catch (e) { if (!(e instanceof AppError && e.code === 'CANCELLED')) setError(toUserMessage(e)) }
    finally { setBusy(false) }
  }

  const media = loaded?.info.media ?? []
  const count = (k: string) => media.filter((m) => m.kind === k).length
  const mediaBytes = media.reduce((s, m) => s + m.size, 0)
  const ext = loaded?.format.toUpperCase() ?? formats[0]!.toUpperCase()
  const where = family === 'ooxml' ? 'the media folder' : family === 'odf' ? 'the Pictures folder' : 'the package'

  return (
    <ToolPage title={title} description={`Inspect ${list(formats)} files and shrink their embedded images. Runs in your browser; macro-free, unencrypted files only.`}
      about={<>
        <p><strong>What this does:</strong> it finds the images embedded in your file (in {where}), re-encodes the JPEG images at the quality you choose, and optionally downsizes very large ones. Each image keeps its format and filename, so the document’s internal references stay exactly as they were.</p>
        <p><strong>Safety checks:</strong> before you can download, the tool re-reads the new file and confirms that every other part (text, formulas, styles, references) is byte-for-byte identical to your original{family !== 'ooxml' ? ', and that the required `mimetype` entry is still first and uncompressed' : ''}.</p>
        <p><strong>Limits:</strong> files with only text, or with images that are already small, may not shrink at all, and then the tool says so. Other image types (GIF, EMF, WMF, SVG, CMYK JPEG) are not changed. Macro-enabled, password-protected and DRM-protected files are rejected. This tool does not convert to PDF or between document formats.</p></>}>
      <div className="space-y-5">
        {!loaded && (
          <>
            <FileDropzone rules={{ accept: ['zip'] }} formatsLabel={list(formats)} multiple={false} label={`Drop a ${formats.map((f) => `.${f}`).join(' / ')} file here`} onFiles={(f) => void select(f[0]!.file)} />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </>
        )}
        {loaded && (
          <>
            <section aria-label="File information" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{loaded.file.name} · {formatBytes(loaded.file.size)}</p>
                <button className={btnGhost} disabled={busy} onClick={() => { setLoaded(null); setReport(null); setError(null) }}>Choose another file</button>
              </div>
              <p className="mt-1 text-slate-600">{loaded.info.parts} parts · {formatBytes(loaded.info.uncompressedSize)} uncompressed · {media.length} embedded image{media.length === 1 ? '' : 's'} ({formatBytes(mediaBytes)})</p>
              {media.length > 0 && <p className="text-slate-600">JPEG: {count('jpeg')} · PNG: {count('png')} · other: {count('other')}</p>}
              {media.length === 0 && <p className="mt-1 text-amber-700">No embedded images were found, so there is nothing this tool can optimize.</p>}
              {media.length > 0 && (
                <details className="mt-2"><summary className="cursor-pointer">Show images</summary>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                    {media.slice(0, 200).map((m) => <li key={m.name} className="flex justify-between gap-3"><span className="truncate">{m.name}</span><span className="shrink-0 text-slate-600">{m.ext.toUpperCase()} · {formatBytes(m.size)}{m.note ? ` · ${m.note}` : ''}</span></li>)}
                  </ul>
                  {media.length > 200 && <p className="text-xs text-slate-600">…and {media.length - 200} more.</p>}
                </details>)}
            </section>

            {media.length > 0 && (
              <>
                <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-4" disabled={busy} onChange={() => setReport(null)}>
                  <legend className="px-1 text-sm font-semibold">Optimization level</legend>
                  {(Object.keys(PRESETS) as CompressPreset[]).map((p) => (
                    <label key={p} className="block text-sm"><input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} /> <strong>{PRESETS[p].label}</strong> – {DETAIL[p]}</label>
                  ))}
                </fieldset>
                <div className="flex items-center gap-3">
                  <button className={btn} disabled={busy} onClick={() => void run()}>{busy ? 'Optimizing…' : `Optimize ${ext}`}</button>
                  {busy && <button className={btnGhost} onClick={() => client.cancel()}>Cancel</button>}
                  {busy && progress && progress.total > 0 && <progress className="h-2 w-48" max={progress.total} value={progress.done} aria-label="Optimizing images" />}
                </div>
              </>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div role="status" aria-live="polite">
              {report && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                  <p>Images found: {report.imagesFound} · optimized: {report.imagesOptimized} · left unchanged: {report.imagesSkipped}</p>
                  {report.noGain ? (
                    <p className="font-medium text-amber-700">No size reduction was possible ({formatBytes(report.originalSize)} → {formatBytes(report.bytes.length)}). Its images are probably already small or well compressed, so keep your original.</p>
                  ) : (
                    <>
                      <p className="font-medium text-green-700">Verified: {formatBytes(report.originalSize)} → {formatBytes(report.bytes.length)} ({savedPercent(report.originalSize, report.bytes.length).toFixed(1)}% smaller). All other parts are identical to the original.</p>
                      <button className={btn} onClick={() => downloadBlob(new Blob([report.bytes as BlobPart], { type: OFFICE[loaded.format].mime }), loaded.file.name.replace(/\.[^.]+$/, `-optimized.${loaded.format}`))}><Download className="mr-1 inline h-4 w-4" />Download optimized {ext}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ToolPage>
  )
}

export const DocxOptimizerPage = () => <OfficeOptimizerPage formats={['docx']} />
export const PptxOptimizerPage = () => <OfficeOptimizerPage formats={['pptx']} />
export const XlsxOptimizerPage = () => <OfficeOptimizerPage formats={['xlsx']} />
export const OdfOptimizerPage = () => <OfficeOptimizerPage formats={['odt', 'ods', 'odp']} />
export const EpubOptimizerPage = () => <OfficeOptimizerPage formats={['epub']} />
