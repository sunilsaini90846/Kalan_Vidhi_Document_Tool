import { AppError } from '@/types/errors'

/**
 * Parses "1-3, 5, 8-" into 1-based page numbers, keeping the order typed
 * (so "3,1,2" reorders). Open ranges ("8-") run to the last page.
 */
export function parsePageSpec(spec: string, total: number): number[] {
  const out: number[] = []
  const parts = spec.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) throw new AppError('PROCESSING_FAILED', 'Enter at least one page or range, e.g. 1-3, 5.')
  for (const part of parts) {
    const m = /^(\d+)?(?:\s*-\s*(\d+)?)?$/.exec(part)
    const isRange = part.includes('-')
    if (!m || (!m[1] && !m[2])) throw new AppError('PROCESSING_FAILED', `"${part}" is not a valid page or range.`)
    const from = m[1] ? Number(m[1]) : 1
    const to = isRange ? (m[2] ? Number(m[2]) : total) : from
    if (from < 1 || to < 1 || from > total || to > total) throw new AppError('PROCESSING_FAILED', `"${part}" is outside this document (1–${total}).`)
    if (from > to) throw new AppError('PROCESSING_FAILED', `"${part}" runs backwards; use ${to}-${from}.`)
    for (let p = from; p <= to; p++) out.push(p)
  }
  return out
}

/** Splits a spec into one group per comma item, for "one file per range" output. */
export function parseRangeGroups(spec: string, total: number): number[][] {
  const parts = spec.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) throw new AppError('PROCESSING_FAILED', 'Enter at least one page or range, e.g. 1-3, 5.')
  return parts.map((p) => parsePageSpec(p, total))
}
