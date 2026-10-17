import { useState } from 'react'
import { Download } from 'lucide-react'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { useWorker } from '@/hooks/useWorker'
import { downloadBlob } from '@/services/downloads/download'
import { savedPercent } from '@/services/image-processing/sizing'
import { PRESETS } from '@/services/image-processing/presets'
import { PRESET_DETAIL, type CompressPreset, type CompressReport } from '@/services/pdf-processing/compress'
import { AppError, toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'
import { PdfPicker } from './PdfPicker'
import { baseName, pdfBlob } from './PdfOutputs'
import { usePdfFile } from './usePdfFile'

export default function CompressPdfPage() {
  const client = useWorker()
  const sel = usePdfFile(client)
  const [preset, setPreset] = useState<CompressPreset>('balanced')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<CompressReport | null>(null)

  async function run() {
    if (!sel.pdf) return
    setBusy(true); setError(null); setReport(null); setProgress(null)
    try { setReport(await client.run('compressPdf', { bytes: sel.pdf.bytes.slice(), preset }, setProgress)) }
    catch (e) { if (!(e instanceof AppError && e.code === 'CANCELLED')) setError(toUserMessage(e)) }
    finally { setBusy(false) }
  }

  const name = sel.pdf ? baseName(sel.pdf.file.name) : 'document'
  return (
    <ToolPage title="PDF Compressor" description="Reduce the size of PDFs that contain photos or scans. Runs in your browser and shows exactly what changed."
      about={<>
        <p><strong>What this does:</strong> it re-encodes JPEG images inside the PDF at the quality you choose (and downsizes very large ones), then rewrites the file with compact object streams. A replaced image is only kept when it is actually smaller.</p>
        <p><strong>What it cannot do:</strong> it does not shrink text, vector graphics or fonts, and it leaves non-JPEG images (for example PNG-style or CMYK images) untouched. A text-only or already-optimized PDF may not get smaller, and in that case we tell you and keep your original.</p>
        <p>Encrypted or digitally signed PDFs are not processed. Lower quality presets visibly reduce image quality.</p></>}>
      <div className="space-y-5">
        <PdfPicker sel={sel} disabled={busy} />
        {sel.pdf && (
          <>
            <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-4" disabled={busy} onChange={() => setReport(null)}>
              <legend className="px-1 text-sm font-semibold">Compression level</legend>
              {(Object.keys(PRESETS) as CompressPreset[]).map((p) => (
                <label key={p} className="block text-sm"><input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} /> <strong>{PRESETS[p].label}</strong> – {PRESET_DETAIL[p]}</label>
              ))}
            </fieldset>
            <div className="flex items-center gap-3">
              <button className={btn} disabled={busy} onClick={() => void run()}>{busy ? 'Compressing…' : 'Compress PDF'}</button>
              {busy && <button className={btnGhost} onClick={() => client.cancel()}>Cancel</button>}
              {busy && progress && progress.total > 0 && <progress className="h-2 w-48" max={progress.total} value={progress.done} aria-label="Recompressing images" />}
              {busy && (!progress || progress.total === 0) && <span className="text-sm text-slate-600">Working…</span>}
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {report && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm" role="status">
                <p>Images found: {report.imagesFound} · recompressed: {report.imagesRecompressed} · left unchanged: {report.imagesSkipped}</p>
                {report.noGain ? (
                  <p className="font-medium text-amber-700">No size reduction was possible with this setting ({formatBytes(report.originalSize)} → {formatBytes(report.bytes.length)}). The file is likely already optimized or has no JPEG images, so keep your original.</p>
                ) : (
                  <>
                    <p className="font-medium text-green-700">Verified {report.pages}-page result: {formatBytes(report.originalSize)} → {formatBytes(report.bytes.length)} ({savedPercent(report.originalSize, report.bytes.length).toFixed(1)}% smaller)</p>
                    <button className={btn} onClick={() => downloadBlob(pdfBlob(report.bytes), `${name}-compressed.pdf`)}><Download className="mr-1 inline h-4 w-4" />Download compressed PDF</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ToolPage>
  )
}
