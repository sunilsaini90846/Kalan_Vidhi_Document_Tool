# Kalan Vidhi Doc Tool

Free, privacy-first file compression and conversion from **Kalan Vidhi** (parent brand) – *Doc Tool* is the product. A static React app: no backend, no database, no login. The tools marked available process files locally in your browser.

Live: https://document-operations.web.app (Firebase project `lazytodisciplinedapp`, Hosting site `document-operations`).
The product name lives in one place, `src/config/brand.ts`.

## What it does

| Area | Tools | Notes |
|---|---|---|
| Images | Compressor, Resizer, Converter, Image to PDF | JPG, PNG, WebP; GIF, BMP, TIFF, AVIF, ICO, SVG as inputs (convert/resize). See the matrix below. |
| PDF | Merge, Split, Extract/Delete/Reorder, Rotate, Compressor | Compressor recompresses **JPEG images** only; it is not a full PDF optimizer. |
| Documents | DOCX, PPTX, XLSX, ODT/ODS/ODP, EPUB optimizers | Re-encode embedded JPEGs; all other parts byte-identical (verified). |
| Archives | ZIP Tools | Inspect/extract ZIP, TAR, GZIP (.gz/.tgz/.tar.gz); create ZIP. |

### Format support
Support is per tool and per operation. The verified matrix is **[docs/FORMATS.md](docs/FORMATS.md)** (generated from `src/services/formats/registry.ts`; a test fails if it drifts). Summary:

- **Supported:** JPEG, PNG, WebP, GIF*, BMP, TIFF, AVIF*, ICO, SVG, APNG (refused unless first-frame opt-in), PDF, DOCX, PPTX, XLSX, ODT, ODS, ODP, EPUB, TXT (via ZIP Tools), ZIP, TAR, GZIP. (*Browser-dependent decode is feature-detected; AVIF and GIF are input-only, as no browser can write them.)
- **Requires a specialized engine (not adopted):** HEIC/HEIF (libheif LGPL + HEVC patents), 7Z, RAR, MP4/MOV/WebM/MP3/WAV/FLAC (ffmpeg.wasm-class engines).
- **Not planned:** RTF.

### Image compression: how it really works
The output format is decided from the file's **content** (signature), never its name or browser-reported type. Every result is re-opened and checked (real format, decodes, expected size, transparency kept) before a download is offered.
- **JPEG / WebP:** canvas re-encode at the chosen quality. If the first try is not smaller than the original, at most two lower qualities are tried (≥30%); the quality used is shown. If nothing is smaller, the original is kept ("0% saved").
- **PNG:** own encoder (fflate deflate level 9, adaptive filters). *High Quality* = lossless (pixel-identical, proven by decoding the output and comparing); *Balanced / Low Size* = palette reduction to 256 / 128 colours (lossy, no dithering, alpha kept), always labelled. A reduced palette is only offered if it still looks like the source (≥ 26 dB PSNR and ≤ 1% of pixels visibly off, `looksLikeSource` in `validate-output.ts`); otherwise only lossless is tried, or the original is kept.
- **Not preserved:** EXIF/GPS and ICC profiles are dropped; colours become sRGB. Animated GIF/APNG/WebP/AVIF are refused (never silently flattened) unless the user opts in to first-frame-only.
- **Limits:** 100 MB per file, 50 megapixels per image (read from the header before decoding), 400 MB per batch. Images are processed one at a time.
- **Root causes fixed** (details in docs/AUDIT.md): output format taken from `file.type`; animated images flattened silently; PNG quality ignored.

### PDF engine and its limits
Built on `pdf-lib` (MIT). See docs/PDF-ENGINES.md for the engine/licence evaluation. The compressor re-encodes **JPEG images** inside the PDF (RGB/Gray/ICC only) and rewrites with object streams; a replacement is kept only when smaller. It does **not** reduce text, vectors, fonts, CMYK or non-JPEG images. Encrypted and digitally signed PDFs are refused (a rewrite would invalidate a signature). PDFs with form fields get a warning for merge/split/extract; rotate and compress keep the original structure.

### Package formats (Office / OpenDocument / EPUB / archives)
Only images are touched (`word|ppt|xl/media/`, ODF `Pictures/`, any JPEG/PNG in an EPUB outside `META-INF/`). Names and formats never change; ODF/EPUB `mimetype` stays first and stored (checked). Macro-enabled files, VBA/Basic/Scripts, encrypted ODF, and DRM-protected EPUB images are refused.
Archive reading counts bytes actually inflated (headers can lie): 5000 entries / 150 MB per file / 300 MB total; unsafe paths (absolute, drive letters, `..`), encrypted entries, ZIP64, TAR links/devices and truncated TAR/GZIP (CRC + length checked) are rejected or never extracted.

### Architecture notes
- `src/workers/handlers.ts` lists every off-main-thread operation; `WorkerClient` sends them to `tasks.worker.ts`; `useWorker()` gives each tool page its own worker, terminated on unmount (Cancel terminates the worker; crashes reject all pending jobs).
- Image jobs are sequential (one decoded image in memory at a time); `ImageBitmap`s are closed in `finally`; object URLs are tracked and revoked (`useObjectUrls`).
- The TIFF decoder (`utif2`, MIT) is a separate lazy chunk loaded only when a TIFF is opened. SVG is rasterized on the main thread (workers cannot load SVG images) after a strict safety check.
- Format knowledge lives in `src/services/formats/registry.ts`; dropzone rules, error messages, the homepage "Supported formats" section and docs derive from it.

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
npx playwright test e2e/tools/<slug>.spec.ts   # one tool's tests, e.g. merge-pdf
npm run docs:formats         # regenerate docs/FORMATS.md from the format registry
node scripts/make-fixtures.mjs   # regenerate test fixtures (needs: npm i --no-save sharp)
node scripts/make-icons.mjs      # regenerate PNG icons/social image (needs sharp)
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
npx firebase-tools emulators:start --only hosting --project demo-kalan-vidhi-doc-tool   # port 5002 if 5000 is busy
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
