import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { UploadCloud } from 'lucide-react'
import { takePendingFiles } from '@/services/handoff'
import { validateBatch, type ValidatedFile, type ValidationRules } from '@/services/file-validation/validate'
import { acceptedLabels } from '@/services/formats/registry'
import { LIMITS } from '@/utils/limits'

interface Props {
  rules: ValidationRules
  existing?: File[]
  multiple?: boolean
  label?: string
  /** Overrides the derived "Accepted formats" text (e.g. ".docx" for a ZIP-based format). */
  formatsLabel?: string
  onFiles: (files: ValidatedFile[]) => void
}

/** Shared picker: drag-and-drop + browse, validation by signature, accepted formats and limits shown up front. */
export function FileDropzone({ rules, existing = [], multiple = true, label = 'Drop files here or browse', formatsLabel, onFiles }: Props) {
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return
    setBusy(true)
    const incoming = multiple ? [...list] : [list[0]!]
    const { accepted, rejected } = await validateBatch(incoming, existing, rules)
    setErrors(rejected.map((r) => r.error.message))
    if (accepted.length) onFiles(accepted)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Files chosen on the homepage arrive here once, when the tool page opens.
  const handleRef = useRef(handle)
  handleRef.current = handle
  useEffect(() => {
    const files = takePendingFiles()
    if (files.length) { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); void handleRef.current(dt.files) }
  }, [])

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files) }
  const formats = formatsLabel ?? (rules.accept === 'any' ? 'Any file type' : acceptedLabels(rules.accept))

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${over ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-white'}`}
      >
        <UploadCloud aria-hidden className="mx-auto h-10 w-10 text-brand-600" />
        <p className="mt-2 font-medium">{busy ? 'Checking files…' : label}</p>
        <p id={hintId} className="mt-1 text-sm text-slate-600">
          Accepted: <strong>{formats}</strong>. Up to {Math.round(LIMITS.maxFileBytes / 1048576)} MB per file{multiple ? `, ${LIMITS.maxFiles} files` : ''}. Files stay on your device; nothing is uploaded.
        </p>
        <input ref={inputRef} id={inputId} type="file" multiple={multiple} aria-describedby={hintId} className="sr-only" onChange={(e) => void handle(e.target.files)} />
        <label htmlFor={inputId} className="mt-4 inline-block cursor-pointer rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 focus-within:outline-2">
          Browse files
        </label>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-red-700">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
    </div>
  )
}
