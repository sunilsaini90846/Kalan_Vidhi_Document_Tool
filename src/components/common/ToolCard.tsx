import { Link } from 'react-router-dom'
import type { ToolDef } from '@/tools/registry'

export function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon
  const body = (
    <>
      <Icon aria-hidden className="h-6 w-6 text-brand-600" />
      <h3 className="mt-3 font-semibold">{tool.name}</h3>
      <p className="mt-1 text-sm text-slate-600">{tool.description}</p>
      <p className="mt-2 text-xs text-slate-500">{tool.formats}</p>
      <span className="mt-3 inline-block text-sm font-medium">
        {tool.status === 'available' ? <span className="text-brand-700">Open tool →</span> : <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Coming soon</span>}
      </span>
    </>
  )
  const cls = 'block rounded-xl border border-slate-200 bg-white p-4'
  return tool.status === 'available'
    ? <Link to={`/${tool.slug}`} className={`${cls} hover:border-brand-600`}>{body}</Link>
    : <div className={`${cls} opacity-80`} aria-disabled="true">{body}</div>
}
