import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Menu, Search, X } from 'lucide-react'
import { BRAND } from '@/config/brand'
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary'

const nav = [
  { to: '/tools?category=image', label: 'Image tools' },
  { to: '/tools?category=pdf', label: 'PDF tools' },
  { to: '/tools?category=document', label: 'Document tools' },
  { to: '/privacy', label: 'Privacy' },
]
const linkCls = 'text-sm font-medium text-slate-700 hover:text-brand-600'

function SearchBox({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); navigate(`/tools${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); onDone?.() }
  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor="site-search" className="sr-only">Search tools</label>
      <Search aria-hidden className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
      <input id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm md:w-48" />
    </form>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-2">Skip to content</a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" aria-label={`${BRAND.name} home`} className="flex items-center gap-2"><img src="/favicon.svg" alt="" width={32} height={32} className="h-8 w-8" /><span className="leading-tight"><span className="block text-base font-bold text-slate-900">{BRAND.parent}</span><span className="block text-xs font-semibold tracking-wide text-brand-700">{BRAND.product}</span></span></Link>
          <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
            {nav.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
            <SearchBox />
          </nav>
          <button className="md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 md:hidden">
            <SearchBox onDone={() => setOpen(false)} />
            {nav.map((n) => <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)} className={linkCls}>{n.label}</NavLink>)}
          </nav>
        )}
      </header>
      <main id="main" className="flex-1"><ErrorBoundary><Outlet /></ErrorBoundary></main>
      <footer className="border-t border-slate-200 bg-white py-6 text-sm text-slate-600">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4">
          <span>© {new Date().getFullYear()} {BRAND.parent} · {BRAND.product}. Supported tools process files locally in your browser.</span>
          <nav aria-label="Footer" className="flex gap-4"><Link to="/tools">All tools</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/about">About</Link><Link to="/contact">Contact</Link></nav>
        </div>
      </footer>
    </div>
  )
}
