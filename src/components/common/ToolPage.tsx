import type { ReactNode } from 'react'
import { Seo } from './Seo'

interface Props { title: string; description: string; about: ReactNode; children: ReactNode }

export function ToolPage({ title, description, about, children }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Seo title={title} description={description} />
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      <div className="mt-6">{children}</div>
      <section className="mt-12 space-y-2 text-sm text-slate-600" aria-label={`About ${title}`}>{about}</section>
    </div>
  )
}

export const btn = 'rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50'
export const btnGhost = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50'
