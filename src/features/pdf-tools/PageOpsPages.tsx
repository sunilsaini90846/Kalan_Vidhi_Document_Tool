import { useState, type ReactNode } from 'react'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { useWorker } from '@/hooks/useWorker'
import { parsePageSpec, parseRangeGroups } from '@/services/pdf-processing/pageSpec'
import { complementPages } from '@/services/pdf-processing/pdfOps'
import type { WorkerClient } from '@/workers/client'
import { AppError, toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'
import { PdfOutputs, baseName, pdfBlob, type Output } from './PdfOutputs'
import { PdfPicker } from './PdfPicker'
import { usePdfFile } from './usePdfFile'

const field = 'rounded-md border border-slate-300 px-2 py-1.5'

/** Shared shell: pick one PDF → options → run → verified outputs. */
function PageOp({ title, description, about, action, options, run }: {
  title: string; description: string; about: ReactNode; action: string
  options: (pages: number) => ReactNode
  run: (c: { client: WorkerClient; bytes: Uint8Array; name: string; pages: number }) => Promise<{ outputs: Output[]; summary: string }>
}) {
  const client = useWorker()
  const sel = usePdfFile(client)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<{ outputs: Output[]; summary: string } | null>(null)

  async function go() {
    if (!sel.pdf) return
    setBusy(true); setError(null); setRes(null)
    try { setRes(await run({ client, bytes: sel.pdf.bytes.slice(), name: baseName(sel.pdf.file.name), pages: sel.pdf.info.pages })) }
    catch (e) { if (!(e instanceof AppError && e.code === 'CANCELLED')) setError(toUserMessage(e)) } finally { setBusy(false) }
  }
  const reset = () => { setRes(null); setError(null); sel.clear() }

  return (
    <ToolPage title={title} description={description} about={about}>
      <div className="space-y-5">
        <PdfPicker sel={sel} disabled={busy} />
        {sel.pdf && (
          <>
            <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" disabled={busy} onChange={() => setRes(null)}>
              <legend className="px-1 text-sm font-semibold">Options</legend>
              {options(sel.pdf.info.pages)}
            </fieldset>
            <button className={btn} disabled={busy} onClick={() => void go()}>{busy ? 'Working…' : action}</button>
            {busy && <button className={btnGhost} onClick={() => client.cancel()}>Cancel</button>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {res && <PdfOutputs outputs={res.outputs} summary={res.summary} zipName={`${baseName(sel.pdf.file.name)}-split.zip`} onReset={reset} />}
          </>
        )}
      </div>
    </ToolPage>
  )
}

const hint = (pages: number) => <p className="text-xs text-slate-500">Document has {pages} page{pages === 1 ? '' : 's'}. Use commas and ranges, e.g. 1-3, 5, 8-.</p>

export function SplitPdfPage() {
  const [mode, setMode] = useState<'each' | 'ranges'>('each')
  const [spec, setSpec] = useState('')
  return (
    <PageOp title="Split PDF" description="Split a PDF into single pages or page ranges. Several outputs are packaged as a ZIP." action="Split PDF"
      about={<><p>Choose “Every page” for one file per page, or “Ranges” where each comma-separated item becomes its own file (for example “1-3, 5” makes two PDFs). Every output is re-opened and its page count verified.</p></>}
      options={(pages) => (
        <>
          <label className="mr-4 text-sm"><input type="radio" checked={mode === 'each'} onChange={() => setMode('each')} /> Every page as its own PDF</label>
          <label className="text-sm"><input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} /> Ranges (one PDF per item)</label>
          {mode === 'ranges' && <div><label className="text-sm">Ranges<br /><input className={`${field} w-full max-w-sm`} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="1-3, 5, 8-" /></label>{hint(pages)}</div>}
        </>
      )}
      run={async ({ client, bytes, name, pages }) => {
        const groups = mode === 'each' ? Array.from({ length: pages }, (_, i) => [i + 1]) : parseRangeGroups(spec, pages)
        const parts = await client.run('splitPdf', { bytes, groups })
        const outputs = parts.map((p, i) => {
          const g = groups[i]!
          return { name: g.length === 1 ? `${name}-page-${g[0]}.pdf` : `${name}-pages-${g[0]}-${g[g.length - 1]}.pdf`, blob: pdfBlob(p) }
        })
        return { outputs, summary: `Created and verified ${outputs.length} PDF${outputs.length === 1 ? '' : 's'} (${formatBytes(outputs.reduce((s, o) => s + o.blob.size, 0))} total).` }
      }}
    />
  )
}

export function ExtractPdfPagesPage() {
  const [mode, setMode] = useState<'keep' | 'delete'>('keep')
  const [spec, setSpec] = useState('')
  return (
    <PageOp title="Extract PDF Pages" description="Keep, delete or reorder pages: build a new PDF from the pages you choose." action={mode === 'keep' ? 'Extract pages' : 'Delete pages'}
      about={<><p>“Keep” builds a new PDF with exactly the pages you list, in the order you type them, so “3, 1, 2” also reorders. “Delete” removes the listed pages and keeps the rest. Deleting every page is not allowed.</p></>}
      options={(pages) => (
        <>
          <label className="mr-4 text-sm"><input type="radio" checked={mode === 'keep'} onChange={() => setMode('keep')} /> Keep these pages (typed order)</label>
          <label className="text-sm"><input type="radio" checked={mode === 'delete'} onChange={() => setMode('delete')} /> Delete these pages</label>
          <div><label className="text-sm">Pages<br /><input className={`${field} w-full max-w-sm`} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="1-3, 5" /></label>{hint(pages)}</div>
        </>
      )}
      run={async ({ client, bytes, name, pages }) => {
        const chosen = parsePageSpec(spec, pages)
        const keep = mode === 'keep' ? chosen : complementPages(pages, chosen)
        if (keep.length === 0) throw new AppError('PROCESSING_FAILED', 'That would remove every page. Keep at least one page.')
        const out = await client.run('extractPages', { bytes, pages: keep })
        return { outputs: [{ name: `${name}-${mode === 'keep' ? 'extracted' : 'edited'}.pdf`, blob: pdfBlob(out) }], summary: `Created and verified a ${keep.length}-page PDF (${formatBytes(out.length)}).` }
      }}
    />
  )
}

export function RotatePdfPage() {
  const [angle, setAngle] = useState<90 | 180 | 270>(90)
  const [spec, setSpec] = useState('')
  return (
    <PageOp title="Rotate PDF" description="Rotate all pages or only the ones you choose." action="Rotate PDF"
      about={<><p>Leave the pages box empty to rotate every page. Rotation is added to each page’s existing rotation, and the rest of the document is left as it is.</p></>}
      options={(pages) => (
        <>
          <label className="text-sm">Rotate clockwise by<br /><select className={field} value={angle} onChange={(e) => setAngle(Number(e.target.value) as 90 | 180 | 270)}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270° (90° anticlockwise)</option></select></label>
          <div><label className="text-sm">Pages (optional)<br /><input className={`${field} w-full max-w-sm`} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="All pages" /></label>{hint(pages)}</div>
        </>
      )}
      run={async ({ client, bytes, name, pages }) => {
        const chosen = spec.trim() ? parsePageSpec(spec, pages) : Array.from({ length: pages }, (_, i) => i + 1)
        const out = await client.run('rotatePages', { bytes, pages: [...new Set(chosen)], delta: angle })
        return { outputs: [{ name: `${name}-rotated.pdf`, blob: pdfBlob(out) }], summary: `Rotated ${new Set(chosen).size} page${chosen.length === 1 ? '' : 's'} by ${angle}° and verified the result (${formatBytes(out.length)}).` }
      }}
    />
  )
}
