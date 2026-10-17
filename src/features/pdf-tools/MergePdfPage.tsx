import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { useWorker } from '@/hooks/useWorker'
import { toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'
import { PdfOutputs, pdfBlob, type Output } from './PdfOutputs'
import { loadPdfFile, type PdfLoad } from './usePdfFile'

let n = 0
interface Entry { id: string; load: PdfLoad }

export default function MergePdfPage() {
  const client = useWorker()
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<{ outputs: Output[]; pages: number } | null>(null)

  const files = entries.map((e) => (e.load.ok ? e.load.pdf.file : e.load.file))
  const good = entries.flatMap((e) => (e.load.ok ? [e.load.pdf] : []))
  const reset = () => setOut(null)
  const move = (i: number, to: number) => { reset(); setEntries((c) => { if (to < 0 || to >= c.length) return c; const x = [...c]; const [m] = x.splice(i, 1); x.splice(to, 0, m!); return x }) }

  async function merge() {
    setBusy(true); setError(null)
    try {
      const r = await client.run('mergePdfs', { sources: good.map((p) => ({ name: p.file.name, bytes: p.bytes.slice() })) })
      setOut({ outputs: [{ name: 'merged.pdf', blob: pdfBlob(r.bytes) }], pages: r.pages })
    } catch (e) { setError(toUserMessage(e)) } finally { setBusy(false) }
  }

  return (
    <ToolPage title="Merge PDF" description="Combine several PDFs into one, in the order you choose. Runs in your browser."
      about={<>
        <p>Add PDFs, arrange them with the arrows, then merge. The merged file is re-opened and its page count checked against the inputs.</p>
        <p>Encrypted PDFs and digitally signed PDFs are rejected (a merge would break a signature). Form fields may not stay interactive after merging, and you will see a warning when a PDF has them.</p></>}>
      <div className="space-y-5">
        <FileDropzone rules={{ accept: ['pdf'] }} existing={files} label="Drop PDFs here" onFiles={async (f) => {
          reset()
          const loaded = await Promise.all(f.map((v) => loadPdfFile(v.file, client)))
          setEntries((c) => [...c, ...loaded.map((load) => ({ id: `m${++n}`, load }))])
        }} />
        {entries.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <p role="status">{entries.length} file{entries.length === 1 ? '' : 's'} · {good.reduce((s, p) => s + p.info.pages, 0)} pages in total</p>
              <button className={btnGhost} disabled={busy} onClick={() => { setEntries([]); reset() }}><Trash2 className="mr-1 inline h-4 w-4" />Clear all</button>
            </div>
            <ol className="space-y-2" aria-label="PDFs to merge, in order">
              {entries.map((e, i) => {
                const f = e.load.ok ? e.load.pdf.file : e.load.file
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <span className="w-6 text-center text-slate-500">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      {e.load.ok
                        ? <p className="text-slate-600">{e.load.pdf.info.pages} pages · {formatBytes(f.size)}{e.load.pdf.info.hasForm ? ' · has form fields' : ''}</p>
                        : <p role="alert" className="text-red-700">{e.load.message}</p>}
                    </div>
                    <button className={btnGhost} aria-label={`Move ${f.name} up`} disabled={busy || i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="h-4 w-4" /></button>
                    <button className={btnGhost} aria-label={`Move ${f.name} down`} disabled={busy || i === entries.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="h-4 w-4" /></button>
                    <button className={btnGhost} aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => { reset(); setEntries((c) => c.filter((x) => x.id !== e.id)) }}><X className="h-4 w-4" /></button>
                  </li>
                )
              })}
            </ol>
            {good.length < entries.length && <p className="text-sm text-amber-700">Remove the files with errors to merge the rest.</p>}
            <button className={btn} disabled={busy || good.length < 2 || good.length < entries.length} onClick={() => void merge()}>{busy ? 'Merging…' : 'Merge PDFs'}</button>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {out && <PdfOutputs outputs={out.outputs} zipName="merged.zip" summary={`Merged and verified: ${out.pages} pages, ${formatBytes(out.outputs[0]!.blob.size)}.`} onReset={() => { setEntries([]); reset() }} />}
          </>
        )}
      </div>
    </ToolPage>
  )
}
