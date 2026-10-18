// Generates fixtures/ui-screenshot.png: a real 1360x547 browser screenshot of a mostly white UI with green, red,
// orange and purple elements and anti-aliased text (the kind of PNG that exposed the 2-colour quantiser bug).
// Usage: node scripts/make-ui-fixture.mjs   (uses the Playwright Chromium already installed for e2e)
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const html = `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0 }
  body { width: 1360px; height: 547px; background: #fff; font: 15px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1e293b; }
  header { display: flex; align-items: center; gap: 24px; height: 56px; padding: 0 32px; border-bottom: 1px solid #e2e8f0 }
  header b { font-size: 18px; color: #6d28d9 } header a { color: #475569; text-decoration: none }
  main { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; padding: 28px 32px }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(15, 23, 42, .08) }
  h2 { font-size: 17px; margin-bottom: 6px } p { color: #64748b; margin-bottom: 12px }
  .btn { display: inline-block; border-radius: 8px; padding: 8px 14px; color: #fff; font-weight: 600; margin: 0 6px 8px 0 }
  .g { background: #16a34a } .r { background: #dc2626 } .o { background: #ea580c } .p { background: #7c3aed }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 13px; font-weight: 600; margin-right: 6px }
  .bg { background: #dcfce7; color: #15803d } .br { background: #fee2e2; color: #b91c1c } .bo { background: #ffedd5; color: #c2410c } .bp { background: #ede9fe; color: #6d28d9 }
  .bar { height: 10px; border-radius: 5px; background: #f1f5f9; margin: 10px 0 } .bar i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, #7c3aed, #ea580c) }
  .dot { width: 44px; height: 44px; border-radius: 50%; float: left; margin-right: 12px; background: radial-gradient(circle at 30% 30%, #fb923c, #7c3aed) }
</style></head><body>
<header><b>Kalan Vidhi</b><a>Image tools</a><a>PDF tools</a><a>Document tools</a><a>Archive tools</a></header>
<main>
  <section class="card"><div class="dot"></div><h2>Compression finished</h2><p>3 files processed locally in your browser. Nothing was uploaded.</p>
    <span class="badge bg">Done</span><span class="badge bo">1 warning</span><div class="bar"><i style="width:72%"></i></div>
    <span class="btn g">Download all</span><span class="btn p">Compress more</span></section>
  <section class="card"><h2>photo-large.png</h2><p>Original 4.2 MB → 1.1 MB · 1920×1080 · PNG reduced to 256 colours</p>
    <span class="badge bg">73.8% smaller</span><span class="badge bp">Lossy</span><div class="bar"><i style="width:26%"></i></div>
    <span class="btn o">Review result</span><span class="btn r">Remove</span></section>
  <section class="card"><h2>scan-0042.pdf</h2><p>Encrypted PDFs are not processed. Remove the password and try again.</p>
    <span class="badge br">Failed</span><span class="badge bo">Encrypted</span><div class="bar"><i style="width:100%"></i></div>
    <span class="btn r">Retry</span><span class="btn p">Learn more</span></section>
  <section class="card" style="grid-column: span 3"><h2>Before you download</h2>
    <p>Every result is re-opened and checked before it is offered: real format, decodes, correct size, transparency kept. If no smaller valid file is possible, the original is kept and the result says 0% saved.</p>
    <span class="badge bg">JPG</span><span class="badge bp">PNG</span><span class="badge bo">WebP</span><span class="badge br">HEIC not supported</span></section>
</main></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1360, height: 547 }, deviceScaleFactor: 1 })
await page.setContent(html)
const png = await page.screenshot({ type: 'png' })
await browser.close()
writeFileSync('fixtures/ui-screenshot.png', png)
console.log('ui-screenshot.png', png.length)
