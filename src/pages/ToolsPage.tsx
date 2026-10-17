import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Seo } from '@/components/common/Seo'
import { ToolCard } from '@/components/common/ToolCard'
import { CATEGORY_LABEL, TOOLS, type ToolCategory } from '@/tools/registry'

const cats = Object.keys(CATEGORY_LABEL) as ToolCategory[]

export default function ToolsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const rawCat = params.get('category')
  const category = cats.find((c) => c === rawCat) ?? null

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return TOOLS.filter((t) => (!category || t.category === category) && (!s || `${t.name} ${t.description} ${t.formats}`.toLowerCase().includes(s)))
  }, [q, category])

  const update = (next: { q?: string; category?: string | null }) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    setParams(p, { replace: true })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Seo title="All tools" description="Browse free image, PDF, document and archive tools that run in your browser." />
      <h1 className="text-3xl font-bold">All tools</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label><span className="sr-only">Search tools</span>
          <input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search by name or format (e.g. PDF)" className="w-full rounded-md border border-slate-300 px-3 py-2 md:w-80" />
        </label>
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[null, ...cats].map((c) => (
            <button key={c ?? 'all'} type="button" aria-pressed={category === c} onClick={() => update({ category: c })}
              className={`rounded-full border px-3 py-1 text-sm ${category === c ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white'}`}>
              {c ? CATEGORY_LABEL[c] : 'All'}
            </button>
          ))}
        </div>
      </div>
      <p role="status" className="mt-3 text-sm text-slate-600">{filtered.length} tool{filtered.length === 1 ? '' : 's'}</p>
      {filtered.length === 0 && <p className="mt-6 text-slate-600">No tools match your search.</p>}
      {cats.map((c) => {
        const items = filtered.filter((t) => t.category === c)
        if (!items.length) return null
        return (
          <section key={c} className="mt-8" aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`} className="mb-3 text-xl font-semibold">{CATEGORY_LABEL[c]}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
          </section>
        )
      })}
    </div>
  )
}
