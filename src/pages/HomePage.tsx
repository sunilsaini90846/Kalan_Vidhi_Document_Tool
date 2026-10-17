import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UploadCloud } from 'lucide-react'
import { Seo } from '@/components/common/Seo'
import { ToolCard } from '@/components/common/ToolCard'
import { routeForFile } from '@/services/file-validation/route'
import { setPendingFiles } from '@/services/handoff'
import { TOOLS } from '@/tools/registry'

const FAQ: [string, string][] = [
  ['Are my files uploaded to a server?', 'No. The tools on this site process your files inside your browser. There is no file upload endpoint, and files are not stored. The page itself is served as static files from Firebase Hosting.'],
  ['Do I need an account?', 'No. There is no sign-up or login.'],
  ['Will my file always get smaller?', 'Not always. Photos and scans often shrink a lot; text-only documents, already-optimized PDFs and Office files with small images may not. When nothing can be reduced we tell you and keep your original; we never show a made-up saving.'],
  ['What happens to quality?', 'Compression presets re-encode images, which can reduce visual quality. Lower presets lose more. Always check the output before replacing an original.'],
  ['Which file types are supported?', 'JPG, PNG and WebP images; PDF; DOCX, PPTX and XLSX (macro-free); and ZIP. Other formats are rejected with a clear message.'],
  ['Why did my PDF or Office file get rejected?', 'Encrypted files, digitally signed PDFs and macro-enabled Office files are refused, because processing them could break or expose important features.'],
  ['Is there a file size limit?', 'Yes. Limits protect your browser from running out of memory (by default 100 MB per file and 400 MB per batch). You will see a message if a file is too large.'],
]

const FORMATS: [string, string][] = [
  ['Images', 'JPG, PNG, WebP: compress, resize, convert, combine into PDF'],
  ['PDF', 'Merge, split, extract/delete/reorder pages, rotate, compress (JPEG images)'],
  ['Office', 'DOCX, PPTX, XLSX: inspect and optimize embedded images'],
  ['Archives', 'ZIP: inspect, extract single files, create'],
]

function HeroUpload() {
  const id = useId()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  async function go(list: FileList | null) {
    if (!list?.length) return
    const files = [...list]
    const route = await routeForFile(files[0]!)
    if (!route) { setMessage('That file type is not supported. Try a JPG, PNG, WebP, PDF, DOCX, PPTX, XLSX or ZIP file.'); return }
    setMessage(null)
    setPendingFiles(route === '/image-compressor' ? files : files.slice(0, 1))
    navigate(route)
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void go(e.dataTransfer.files) }}
      className={`mx-auto mt-8 max-w-xl rounded-2xl border-2 border-dashed p-8 ${over ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-white'}`}>
      <UploadCloud aria-hidden className="mx-auto h-10 w-10 text-brand-600" />
      <p className="mt-2 font-medium">Drop a file to get started</p>
      <p className="mt-1 text-sm text-slate-500">We will open the right tool. Your file stays on your device.</p>
      <input id={id} type="file" multiple className="sr-only" onChange={(e) => void go(e.target.files)} />
      <label htmlFor={id} className="mt-4 inline-block cursor-pointer rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">Choose files</label>
      {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
    </div>
  )
}

export default function HomePage() {
  const popular = TOOLS.filter((t) => t.popular)
  return (
    <>
      <Seo title="Free file compression and conversion" description="Free, private tools to compress and convert images, PDFs and Office files. Supported tools run in your browser with no sign-up." />
      <section className="mx-auto max-w-6xl px-4 py-14 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Free file compression and conversion</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Compress images and PDFs, merge and split documents, and optimize Office files. No account needed, and the tools on this site process your files locally in your browser instead of uploading them.</p>
        <HeroUpload />
        <p className="mt-4 text-sm text-slate-600">Or <Link to="/tools" className="text-brand-700 underline">browse all tools</Link>.</p>
      </section>

      <section aria-labelledby="popular" className="mx-auto max-w-6xl px-4 pb-14">
        <h2 id="popular" className="mb-4 text-2xl font-semibold">Popular tools</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{popular.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
      </section>

      <section aria-labelledby="how" className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="how" className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[['Choose a file', 'Pick or drop a file. We check what it really is (not just its extension) and its size.'],
              ['Set options and process', 'Choose a preset or settings. Heavy work runs in a background thread in your browser, so the page stays responsive. You can cancel at any time.'],
              ['Check and download', 'The result is validated first, and you see real before-and-after sizes. Download it, or process another file.']].map(([t, d], i) => (
              <li key={t}><span className="text-sm font-semibold text-brand-600">Step {i + 1}</span><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="privacy" className="mx-auto max-w-6xl px-4 py-14">
        <h2 id="privacy" className="text-2xl font-semibold">Privacy and security</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
          <li>Files are processed in your browser; this site has no backend and no file storage.</li>
          <li>No account, no advertising and no analytics scripts.</li>
          <li>Uploaded files are treated as untrusted: content is checked by file signature, sizes are capped, and ZIP archives are checked for unsafe paths and decompression bombs.</li>
          <li>Closing or leaving a tool releases the memory it used. Nothing is guaranteed to be perfectly secure, so read the <Link to="/privacy" className="text-brand-700 underline">privacy page</Link> for details.</li>
        </ul>
      </section>

      <section aria-labelledby="formats" className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="formats" className="text-2xl font-semibold">Supported formats</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {FORMATS.map(([k, v]) => <div key={k} className="rounded-xl border border-slate-200 p-4"><dt className="font-semibold">{k}</dt><dd className="mt-1 text-sm text-slate-600">{v}</dd></div>)}
          </dl>
        </div>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-4 py-14">
        <h2 id="faq" className="text-2xl font-semibold">Frequently asked questions</h2>
        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {FAQ.map(([q, a]) => <details key={q} className="group p-4"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-sm text-slate-600">{a}</p></details>)}
        </div>
      </section>
    </>
  )
}
