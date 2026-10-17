import { FileDropzone } from '@/components/upload/FileDropzone'
import { rulesFor } from '@/services/formats/registry'
import { btnGhost } from '@/components/common/ToolPage'
import { FORM_WARNING } from '@/services/pdf-processing/pdfOps'
import { formatBytes } from '@/utils/limits'
import type { usePdfFile } from './usePdfFile'

const RULES = rulesFor('split-pdf')

export function PdfPicker({ sel, disabled }: { sel: ReturnType<typeof usePdfFile>; disabled?: boolean }) {
  if (sel.pdf) {
    const { file, info } = sel.pdf
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm">
          <p className="font-medium">{file.name}</p>
          <p className="text-slate-600">{info.pages} page{info.pages === 1 ? '' : 's'} · {formatBytes(file.size)}{info.title ? ` · “${info.title}”` : ''}</p>
          {info.hasForm && <p className="mt-1 text-amber-700">{FORM_WARNING}</p>}
        </div>
        <button className={btnGhost} disabled={disabled} onClick={sel.clear}>Choose another PDF</button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <FileDropzone rules={RULES} multiple={false} label={sel.loading ? 'Reading PDF…' : 'Drop a PDF here'} onFiles={(f) => void sel.select(f[0]!.file)} />
      {sel.error && <p role="alert" className="text-sm text-red-700">{sel.error}</p>}
    </div>
  )
}
