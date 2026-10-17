import { useCallback, useState } from 'react'
import type { PdfInfo } from '@/services/pdf-processing/pdfOps'
import { toUserMessage } from '@/types/errors'
import type { WorkerClient } from '@/workers/client'

export interface LoadedPdf { file: File; bytes: Uint8Array; info: PdfInfo }
export type PdfLoad = { ok: true; pdf: LoadedPdf } | { ok: false; file: File; message: string }

/** Reads the file and parses it in the worker, so large PDFs do not freeze the page. */
export async function loadPdfFile(file: File, client: WorkerClient): Promise<PdfLoad> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const info = await client.run('inspectPdf', { bytes: bytes, name: file.name })
    return { ok: true, pdf: { file, bytes, info } }
  } catch (e) {
    return { ok: false, file, message: toUserMessage(e) }
  }
}

/** Single-PDF selection state shared by Split / Extract / Rotate / Compress. */
export function usePdfFile(client: WorkerClient) {
  const [state, setState] = useState<PdfLoad | null>(null)
  const [loading, setLoading] = useState(false)
  const select = useCallback(async (file: File) => { setLoading(true); setState(await loadPdfFile(file, client)); setLoading(false) }, [client])
  const clear = useCallback(() => setState(null), [])
  return { state, loading, select, clear, pdf: state?.ok ? state.pdf : null, error: state && !state.ok ? state.message : null }
}
