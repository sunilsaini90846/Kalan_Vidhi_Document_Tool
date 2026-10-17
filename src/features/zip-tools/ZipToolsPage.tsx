import { useState } from 'react'
import { Download, Trash2, X } from 'lucide-react'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { ToolPage, btn, btnGhost } from '@/components/common/ToolPage'
import { ARCHIVE_LIMITS } from '@/services/archive-processing/limits'
import { useWorker } from '@/hooks/useWorker'
import type { ArchiveEntry, ArchiveKind } from '@/services/archive-processing/archive'
import { downloadBlob } from '@/services/downloads/download'
import { savedPercent } from '@/services/image-processing/sizing'
import { AppError, toUserMessage } from '@/types/errors'
import { formatBytes } from '@/utils/limits'

const RISKY = /\.(exe|msi|bat|cmd|com|scr|ps1|sh|js|jse|vbs|jar|app|dmg|apk|lnk)$/i
const field = 'rounded-md border border-slate-300 px-2 py-1.5'
const CREATE_MAX_BYTES = 250 * 1024 * 1024

export default function ZipToolsPage() {
  return (
    <ToolPage title="ZIP Tools" description="Inspect ZIP, TAR and GZIP archives, extract single files safely, or create a ZIP. Everything runs in your browser."
      about={<>
        <p><strong>Safety:</strong> entry paths are checked and archives containing absolute paths or “..” segments are rejected. Nothing is ever opened or run; files are only offered as downloads. Extracted files keep just their file name, never folders. Be careful with files like .exe, .bat or .js.</p>
        <p><strong>Limits:</strong> up to {ARCHIVE_LIMITS.maxEntries} entries, {formatBytes(ARCHIVE_LIMITS.maxTotalBytes)} when expanded, {formatBytes(ARCHIVE_LIMITS.maxEntryBytes)} per file. Password-protected and ZIP64 archives are not supported. TAR and GZIP files can be inspected and extracted but not created; links inside TARs are listed and never extracted. 7Z and RAR are not supported. Size limits are enforced while unpacking, not just from the archive’s own claims.</p>
        <p>Photos, videos, PDFs and Office files are already compressed, so zipping them usually makes them no smaller.</p></>}>
      <div className="grid gap-10 lg:grid-cols-2">
        <OpenZip />
        <CreateZip />
      </div>
    </ToolPage>
  )
}

function OpenZip() {
  const client = useWorker()
  const [state, setState] = useState<{ file: File; bytes: Uint8Array; entries: ArchiveEntry[]; kind: ArchiveKind; note?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function open(file: File, kind: ArchiveKind) {
    setError(null); setState(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const r = await client.run('listArchive', { bytes: bytes, kind, name: file.name })
      setState({ file, bytes, kind, entries: r.entries, note: r.note })
    } catch (e) { setError(toUserMessage(e)) }
  }
  async function extract(name: string) {
    if (!state) return
    setError(null)
    try {
      const data = await client.run('extractArchiveEntry', { bytes: state.bytes, kind: state.kind, entry: name, name: state.file.name })
      if (!data) throw new AppError('PROCESSING_FAILED', 'That file could not be extracted.')
      downloadBlob(new Blob([data as BlobPart]), name.split('/').pop() || 'file')
    } catch (e) { setError(toUserMessage(e)) }
  }

  const files = state?.entries.filter((e) => !e.isDirectory) ?? []
  const total = files.reduce((s, e) => s + e.size, 0)
  return (
    <section aria-labelledby="open-zip" className="space-y-4">
      <h2 id="open-zip" className="text-xl font-semibold">Inspect and extract</h2>
      {!state && <FileDropzone rules={{ accept: ['zip', 'gzip', 'tar'] }} formatsLabel="ZIP, TAR, GZIP (.gz, .tgz, .tar.gz)" multiple={false} label="Drop an archive here" onFiles={(f) => void open(f[0]!.file, f[0]!.kind as ArchiveKind)} />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {state && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p role="status">{state.file.name} · {formatBytes(state.file.size)} · {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(total)} expanded{state.note ? ` · ${state.note}` : ''}</p>
            <button className={btnGhost} onClick={() => { setState(null); setError(null) }}>Close</button>
          </div>
          <ul className="max-h-96 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-2 text-sm" aria-label="Archive contents">
            {files.map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate">{e.name}</span>
                  <span className="text-xs text-slate-500">{formatBytes(e.size)} → {formatBytes(e.compressedSize)}{e.size > 0 ? ` (${savedPercent(e.size, e.compressedSize).toFixed(0)}% saved)` : ''}
                    {e.encrypted && ' · encrypted'}{e.unsafePath && ' · unsafe path, blocked'}{e.note && ` · ${e.note}`}{RISKY.test(e.name) && ' · executable type: do not run unless you trust the source'}</span>
                </span>
                <button className={btnGhost} disabled={!e.extractable} aria-label={`Extract ${e.name}`} onClick={() => void extract(e.name)}>Extract</button>
              </li>
            ))}
          </ul>
          {files.length === 0 && <p className="text-sm text-slate-600">This archive has no files.</p>}
        </>
      )}
    </section>
  )
}

function CreateZip() {
  const client = useWorker()
  const [files, setFiles] = useState<File[]>([])
  const [level, setLevel] = useState<'auto' | 0 | 9>('auto')
  const [name, setName] = useState('archive')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; input: number } | null>(null)
  const total = files.reduce((s, f) => s + f.size, 0)
  const tooBig = total > CREATE_MAX_BYTES

  async function create() {
    setBusy(true); setError(null); setResult(null)
    try {
      const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })))
      const zip = await client.run('createZip', { files: data, level, maxBytes: CREATE_MAX_BYTES })
      setResult({ blob: new Blob([zip as BlobPart], { type: 'application/zip' }), input: total })
    } catch (e) { setError(toUserMessage(e)) } finally { setBusy(false) }
  }
  const change = (fn: (c: File[]) => File[]) => { setResult(null); setFiles(fn) }

  return (
    <section aria-labelledby="create-zip" className="space-y-4">
      <h2 id="create-zip" className="text-xl font-semibold">Create a ZIP</h2>
      <FileDropzone rules={{ accept: 'any' }} existing={files} label="Drop any files to add" onFiles={(f) => change((c) => [...c, ...f.map((v) => v.file)])} />
      {files.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm">
            <p role="status">{files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(total)}</p>
            <button className={btnGhost} onClick={() => change(() => [])}><Trash2 className="mr-1 inline h-4 w-4" />Clear all</button>
          </div>
          <ul className="max-h-60 space-y-1 overflow-auto text-sm" aria-label="Files to zip">
            {files.map((f) => <li key={`${f.name}${f.size}${f.lastModified}`} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1"><span className="truncate">{f.name} · {formatBytes(f.size)}</span>
              <button className={btnGhost} aria-label={`Remove ${f.name}`} onClick={() => change((c) => c.filter((x) => x !== f))}><X className="h-4 w-4" /></button></li>)}
          </ul>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>Compression<br /><select className={field} value={level} onChange={(e) => { setResult(null); setLevel(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 0 | 9)) }}>
              <option value="auto">Automatic (skip already-compressed files)</option><option value={0}>Store only (no compression)</option><option value={9}>Maximum</option></select></label>
            <label>File name<br /><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
          </div>
          {tooBig && <p role="alert" className="text-sm text-red-700">Total size exceeds {formatBytes(CREATE_MAX_BYTES)}, which is too much to zip safely in the browser.</p>}
          <button className={btn} disabled={busy || tooBig} onClick={() => void create()}>{busy ? 'Creating…' : 'Create ZIP'}</button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {result && (
            <div role="status" className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
              <p className="font-medium text-green-800">Created and verified: {formatBytes(result.input)} → {formatBytes(result.blob.size)}
                {result.blob.size >= result.input ? ` (${formatBytes(result.blob.size - result.input)} larger: these files are already compressed)` : ` (${savedPercent(result.input, result.blob.size).toFixed(1)}% smaller)`}</p>
              <button className={btn} onClick={() => downloadBlob(result.blob, `${name.trim().replace(/\.zip$/i, '').replace(/[\\/:*?"<>|]/g, '_') || 'archive'}.zip`)}><Download className="mr-1 inline h-4 w-4" />Download ZIP</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
