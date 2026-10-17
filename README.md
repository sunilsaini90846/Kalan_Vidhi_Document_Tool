# FileSqueeze

Free, privacy-first file compression and conversion. Static React app: no backend, no database, no login. Supported tools process files locally in the browser.

## Status
- Phase 1 (foundation): done.
- Phase 2 (image tools): Image Compressor, Resizer, Converter, Image to PDF.
- Phase 3 (PDF tools): Merge, Split (every page or ranges, ZIP output), Extract/Delete/Reorder pages, Rotate, Compressor.
- Phase 4 (Office and archive tools): DOCX / PPTX / XLSX optimizers (with file information and embedded-image listing) and ZIP Tools (inspect, extract single files, create).
- All 13 planned tools are available. A tool not yet working would be marked `coming-soon` in `src/tools/registry.ts` and has no route.

### Office and ZIP behaviour and limits
Office files are ZIP packages. Only images under `word|ppt|xl/media/` are touched: JPEG (RGB/gray) re-encoded; PNG only downscaled by the Balanced/Strong presets; GIF/EMF/WMF/CMYK JPEG untouched. Filenames and formats never change, so relationships and content types stay valid. Every other part is rewritten byte-identically, and the output is re-read and checked part-by-part before download is offered. Macro-enabled (DOCM/XLSM/PPTM, or any package containing VBA) and encrypted files are rejected. No Office-to-PDF conversion.
ZIP reading counts bytes actually inflated (headers can lie), enforcing 5000 entries / 150 MB per file / 300 MB total, and rejects absolute paths, drive letters and `..` segments, encrypted entries, ZIP64 and unsupported compression methods. Extraction offers single files as downloads using only the base file name; nothing is executed.


### PDF engine and its limits
Built on `pdf-lib` (MIT). `pdf-lib` cannot compress by itself, and WebAssembly optimizers such as Ghostscript and MuPDF are AGPL-licensed, so they were not adopted. The compressor instead re-encodes **JPEG images** inside the PDF through the browser (RGB/Gray/ICC-based only) and rewrites the file with object streams; a replaced image is kept only when it is smaller. It does **not** reduce text, vectors, fonts, CMYK or non-JPEG images, and it reports "no reduction possible" (keeping your original) when that is the case.
Encrypted PDFs are rejected with a clear message. Digitally signed PDFs are rejected (any rewrite would invalidate the signature). PDFs with form fields get a warning because copying pages (merge/split/extract) may not keep fields interactive; rotate and compress keep the original structure.
Not included: PDF page preview thumbnails (would need pdf.js), and the standalone "delete" / "reorder" pages (covered by the Extract tool's Delete mode and typed page order).

- Phase 5 (quality): all heavy work runs in a module Web Worker (`src/workers/`); Cancel terminates the worker. Homepage sections (hero upload that routes to the right tool, how it works, privacy, formats, FAQ), header search and category filters, per-page meta/Open Graph tags, optional canonical URLs and `sitemap.xml` (set `VITE_SITE_URL`), axe accessibility scans of every route, and an e2e run under the production CSP.

### Architecture notes
- `src/workers/handlers.ts` lists every off-main-thread operation; `WorkerClient` (`client.ts`) sends them to `tasks.worker.ts`. `useWorker()` gives each tool page its own worker, terminated on unmount.
- Image encoding uses `OffscreenCanvas` (works in workers) with a DOM-canvas fallback.
- Object URLs are tracked and revoked by `useObjectUrls`; input bytes live only in component state and are released when a file is cleared.

## Commands
```bash
npm install                  # 1. install dependencies (use `npm ci` in CI)
npm run dev                  # 2. local dev server
npm test                     # 3. unit/component tests (Vitest)
npm run typecheck
npm run build                # 4. production build -> dist (also writes sitemap.xml if VITE_SITE_URL is set)
npm run preview              # 5. serve the production build locally
npx playwright install chromium   # once, for e2e
npm run e2e                  # browser tests: desktop + mobile Chrome, axe accessibility scans
npm run test:all             # typecheck + unit + e2e
```
Node 20.17+ works; Vite 6 / Vitest 4.1 are pinned for that reason (Vite 7+ / Vitest 5 need Node ≥ 20.19 / 22).

## Deploy to Firebase Hosting (static, no backend)
`firebase.json` is already configured (serves `dist`, SPA rewrite, caching, security headers, CSP). Do **not** let `firebase init` overwrite it.
```bash
npm install -g firebase-tools        # 6. install the CLI (Node >= 20)
firebase login                       # 7. log in (opens a browser)
firebase init hosting                # 8. only if you want the wizard: public dir "dist", single-page app "Yes",
                                     #    GitHub deploys "No", and answer "No" to overwriting firebase.json / index.html
#   or, simpler, just link the project (creates the git-ignored .firebaserc):
firebase use --add                   #    pick your project, alias "default"
cp .firebaserc.example .firebaserc   #    ...or copy the example and edit the project id by hand

VITE_SITE_URL=https://your-domain npm run build   # canonical URLs + sitemap use this (omit until you have a domain)
firebase deploy --only hosting       # 9. deploy
```
Preview before going live: `firebase hosting:channel:deploy preview` gives a temporary URL.

### Custom domain and HTTPS (10)
1. Firebase console → Hosting → **Add custom domain**, enter your domain.
2. Add the DNS records Firebase shows (a TXT record to verify ownership, then A records or CNAME) at your DNS provider.
3. Firebase provisions and renews the HTTPS certificate automatically; this can take from minutes to a day.
4. Set `VITE_SITE_URL=https://your-domain`, rebuild, redeploy so canonical URLs and `sitemap.xml` are correct.
5. Submit `https://your-domain/sitemap.xml` in Google Search Console if you want it indexed.

### Current deployment
Live at https://document-operations.web.app (Hosting site `document-operations` in Firebase project `lazytodisciplinedapp`; the site is set in `firebase.json`, the project in the git-ignored `.firebaserc`). The project hosts other sites too; `firebase deploy --only hosting` only touches this one because `firebase.json` names it. Redeploy:
```bash
VITE_SITE_URL=https://document-operations.web.app npm run build
npx firebase-tools deploy --only hosting --project lazytodisciplinedapp
npm run verify:hosting -- https://document-operations.web.app
```
This app intentionally does **not** use the Firebase client SDK or Analytics (no config keys are needed or stored).

## Release checklist
Run these before every release; all must pass.
```bash
npm ci
npm run typecheck && npm test && npm audit
npm run build
npm run e2e                                           # against the local preview server
# Verify the real Hosting rules locally (serves dist with firebase.json, no project needed):
npx firebase-tools emulators:start --only hosting --project demo-filesqueeze   # port 5002 if 5000 is busy
npm run verify:hosting -- http://127.0.0.1:5002       # every route, caching, security headers
E2E_BASE_URL=http://127.0.0.1:5002 npm run e2e        # full browser suite under the real CSP
firebase deploy --only hosting
npm run verify:hosting -- https://your-domain         # same checks against production (includes HTTPS)
```
`verify:hosting` checks that every published route loads on direct navigation/refresh, the HTML shell is `no-cache`, hashed assets are `immutable`, and CSP / `nosniff` / frame headers are present. Rollback: Firebase console → Hosting → release history → **Rollback**.

### CI / automated deploy (optional)
`.github/workflows/ci.yml` runs typecheck, unit tests, `npm audit --omit=dev`, build and e2e on every PR and push. On pushes to `main` it also deploys, but only when both are set in the repository settings: secret `FIREBASE_SERVICE_ACCOUNT` (service-account JSON with Firebase Hosting Admin; create it with `firebase init hosting:github` or in Google Cloud IAM) and variable `FIREBASE_PROJECT_ID`. Optional variable `SITE_URL` feeds `VITE_SITE_URL`. No secrets are stored in the repo.

## Hosting notes and free-tier limits
- Firebase Hosting's free (Spark) plan has caps on stored data and monthly/daily data transfer; they are quotas, not "unlimited". Check the current numbers at https://firebase.google.com/pricing before launch. Because files are processed in the browser, only the static site counts toward transfer (1.28 MB on disk in total, about 0.5 MB gzipped; a first visit downloads only the homepage bundle, and each tool page and the worker load on demand).
- Unknown URLs return the app shell with HTTP 200 (single-page-app fallback); the in-app 404 page sets `noindex`. A true HTTP 404 would need a server-side route list, which this static setup deliberately avoids.
- No backend, database, Cloud Functions or authentication is used or required.

## Limits
File count/size caps live in `src/utils/limits.ts` (override via `.env`, see `.env.example`).
