import { useState } from 'react'
import { Download } from 'lucide-react'
import { btn, btnGhost } from '@/components/common/ToolPage'
import { downloadBlob, zipBlobs } from '@/services/downloads/download'
import { formatBytes } from '@/utils/limits'

export interface Output { name: string; blob: Blob }

export function PdfOutputs({ outputs, summary, zipName, onReset }: { outputs: Output[]; summary: string; zipName: string; onReset: () => void }) {
  const [zipping, setZipping] = useState(false)
  return (
    <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
      <p role="status" className="text-sm font-medium text-green-800">{summary}</p>
      <ul className="space-y-1 text-sm">
        {outputs.length <= 20 ? outputs.map((o) => (
          <li key={o.name} className="flex items-center justify-between gap-2">
            <span className="truncate">{o.name} · {formatBytes(o.blob.size)}</span>
            <button className={btnGhost} onClick={() => downloadBlob(o.blob, o.name)}>Download</button>
          </li>
        )) : <li>{outputs.length} files · {formatBytes(outputs.reduce((s, o) => s + o.blob.size, 0))}</li>}
      </ul>
      <div className="flex flex-wrap gap-3">
        {outputs.length > 1 && (
          <button className={btn} disabled={zipping} onClick={async () => { setZipping(true); try { downloadBlob(await zipBlobs(outputs), zipName) } finally { setZipping(false) } }}>
            <Download className="mr-1 inline h-4 w-4" />Download all (ZIP)
          </button>
        )}
        <button className={btnGhost} onClick={onReset}>Process another file</button>
      </div>
    </div>
  )
}

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })
export const baseName = (n: string) => n.replace(/\.pdf$/i, '')
