# Audit and upgrade report: Kalan Vidhi Doc Tool

## 1. Baseline (before any change)
Git: clean working tree on `main`. Baseline run: typecheck pass, 97 unit tests, 137 browser tests (+1 skipped by design), production build OK, `npm audit` 0 vulnerabilities.

### Feature inventory (verified against code, before this upgrade)
| Tool | Accepted input | Output | Engine | Compression / operation |
|---|---|---|---|---|
| Image Compressor | JPEG, PNG, WebP | same format | canvas (OffscreenCanvas) in worker | re-encode; keep original if larger |
| Image Resizer / Converter | JPEG, PNG, WebP | JPEG/PNG/WebP | canvas | resize / convert |
| Image to PDF | JPEG, PNG, WebP | PDF | pdf-lib + canvas | layout, grid, rotate |
| PDF Merge/Split/Extract/Rotate | PDF | PDF / ZIP | pdf-lib | page ops |
| PDF Compressor | PDF | PDF | pdf-lib + canvas | JPEG recompression only |
| DOCX/PPTX/XLSX | OOXML | same | fflate + canvas | embedded JPEG/PNG; other parts byte-identical |
| ZIP Tools | ZIP | ZIP / single files | fflate | inspect, extract one file, create |

## 2. Prioritized bug list (reproduced on real files against the deployed build)
| # | Severity | Bug | Reproduction | Status |
|---|---|---|---|---|
| B1 | Critical | Output format chosen from browser `file.type`, not content. A transparent PNG with no MIME type, or misnamed `.jpg`, became a lossy JPEG with a white background, reported "97.4% smaller". | Upload `alpha.png` as `application/octet-stream` or as `alpha.jpg`; Compress. | **Fixed** (format from signature); regression tests ×4 |
| B2 | Critical | Animated WebP and APNG silently flattened to frame 1, reported "56% smaller". | Upload `animated.webp` / `animated.png`; Compress. | **Fixed** (refused unless first-frame opt-in; disclosed) |
| B3 | High | PNG quality setting ignored; PNG "compression" was a canvas re-encode, often "already optimized". | Move quality slider on `photo.png`: identical output. | **Fixed** (own PNG encoder; lossless or palette reduction, labelled) |
| B4 | High | Encrypted PDFs reported as "damaged": pdf-lib's error failed `instanceof`. Untested before. | New test builds a real encrypted PDF. | **Fixed** (message check) |
| B5 | Medium | A corrupt PNG with garbage header was reported as a 13-billion-megapixel image. | `corrupt.png` fixture. | **Fixed** (IHDR validated) |
| B6 | Medium | Truncated TAR/GZIP accepted (new code, found by tests before release). | Truncated fixtures. | **Fixed** (padded bounds, gzip CRC + length) |
| B7 | Medium | Capability probe called `convertToBlob` on an undrawn canvas, so JPEG/PNG looked unsupported (new code, found by re-running the repro). | Probe run. | **Fixed** |
| B8 | Low | Buffers copied twice per worker call (`slice()` then structured clone). | Code review. | **Fixed** |
| B9 | Low | Result rows unreadable on narrow phones. | Screenshot at 390 px. | **Fixed** |
| B10 | Low | Text-like files named `.pdf`/`.exe` were described as "a TXT file". | e2e failure after adding text sniffing. | **Fixed** |

## 3. Root-cause analysis: image compression
1. **Format from `file.type` (B1).** `useImageBatch` mapped `file.type` to the output MIME with a JPEG fallback. File type comes from the OS/browser and is empty or wrong for dragged/renamed files. Signature detection existed but only gated acceptance. Fix: `decodeImage` detects the kind from bytes and `runImageJob` derives output format from it.
2. **Silent animation loss (B2).** `createImageBitmap` returns the first frame without error, so "success" proved nothing. Fix: animation is detected from the container (GIF block walk, APNG `acTL`, WebP `VP8X` flag, AVIF `avis`) before decoding.
3. **PNG (B3).** Canvas PNG encoding has no quality or palette control; there was nothing for the slider to drive. Fix: own encoder (`png.ts`) with adaptive filters, deflate-9, median-cut quantization and indexed output with `tRNS`.
4. **Encoder success is not validity.** Every output is now checked: non-empty, signature matches the intended format, decodes, exact dimensions (this also proves orientation), alpha still present when expected; PNG output is decoded and compared pixel-by-pixel with what was meant to be written.
The library was not replaced; `browser-image-compression` remains unused and could be removed from `package.json`.

## 4. Verified format-support matrix
See [FORMATS.md](FORMATS.md) (generated from the registry; a unit test fails on drift). New this release: GIF, BMP, TIFF (utif2, lazy), AVIF (browser, feature-detected), ICO, SVG (sanitized, rasterized), ODT/ODS/ODP, EPUB, TAR, GZIP. Evaluated and not adopted: HEIC/HEIF (libheif LGPL + HEVC patent exposure), 7Z/RAR, all audio/video (ffmpeg.wasm-class), RTF. Documented limits: AVIF/GIF/TIFF/ICO/SVG are input-only; TIFF first page only; multi-size ICO uses the browser's choice.

## 5. Implementation plan and what was done
| Phase | Result |
|---|---|
| 1 Audit | Baseline, inventory, reproduction (this file) |
| 2 Compression correctness | New decode/job/validate/PNG layers; 24 regression scenarios |
| 3 Format registry | `src/services/formats/registry.ts` + generated docs |
| 4 New formats | See §4; fixtures are genuine files (`fixtures/`, `scripts/make-fixtures.mjs`) |
| 5 PDF/Office | Encrypted/signed/form/malformed PDF tests; ODF/EPUB packages; PDF engine evaluation |
| 6 Rebrand | `src/config/brand.ts`, header/footer/hero/titles/OG/manifest/icons/README/CI; routes, Firebase IDs, domain unchanged |
| 7 UX | Accepted formats + limits shown before selection; per-file method and notes; reasons for rejection; mobile row layout; live regions |
| 8 Memory | One image at a time, bitmaps closed in `finally`, 50 MP cap read from headers, redundant copies removed, worker lifecycle tests |
| 9 Testing | See §6 |
| 10 Deployment safety | See §8; **nothing committed or deployed** |

## 6. Test report (final run)
| Check | Result |
|---|---|
| `npm run typecheck` (strict) | pass |
| Linting | not configured in this project (none run) |
| Unit/component tests (Vitest) | **219 passed**, 18 files |
| Browser tests (Playwright, desktop + mobile Chrome) | **253 passed**, 1 skipped (mobile-only test on desktop) |
| Same suite against the Firebase Hosting emulator (real CSP/headers) | **253 passed** |
| Accessibility (axe WCAG 2 A/AA, all 22 routes + results screen) | no violations |
| `verify:hosting` against the emulator | all checks passed |
| Production build | OK; sitemap 21 URLs with `VITE_SITE_URL` |
| `npm audit` | 0 vulnerabilities |
Coverage highlights: JPEG/PNG/WebP round trips, PNG lossless pixel equality, alpha preservation, MIME/extension mismatch, empty/corrupt/truncated files, 1×1 and 24 MP images, 400 MP refusal, custom quality, bounded quality ladder, resize/no-enlarge, EXIF orientation, batch partial failure, cancellation, downloads (name, MIME, bytes), every new format, SVG attack file, ODF/EPUB `mimetype` rules, tar/gzip bombs and traversal, encrypted/signed PDFs, brand scan.
Not tested: real 100 MB+ files and real mobile-device memory limits; non-Chromium browsers (Firefox/Safari WebP-encode and AVIF decode differ; handled by feature detection but not exercised here); screen-reader behaviour beyond axe rules.

## 7. Unresolved issues
- Firefox/Safari untested; WebP output unavailable in some browsers (UI disables it with a reason).
- PNG palette reduction has no dithering (banding on gradients; labelled lossy).
- ICC profiles are not preserved (converted to sRGB).
- Image-to-PDF still has no crop tool; no PDF page preview (engine candidates in PDF-ENGINES.md).
- Contact page is still a placeholder.
- PDF Compressor only recompresses JPEGs; `browser-image-compression` dependency is unused.
- HEIC, 7Z, RAR, RTF, audio/video unsupported (reasons in FORMATS.md).
- No true HTTP 404 for unknown URLs (static SPA fallback; the in-app 404 is `noindex`).

## 8. Release, deployment and rollback (not yet performed)
Pre-release checklist (all done except the last two): full diff reviewed, secret scan clean (`.firebaserc`/`.env` ignored), full suite green, production build, hosting config verified on the emulator, branded metadata and sitemap confirmed, deploy target unchanged (`document-operations` in `lazytodisciplinedapp`).
Remaining: **review and commit** (not done: awaiting approval), **deploy** (not done: awaiting approval).
```bash
git add -A && git commit              # after review
VITE_SITE_URL=https://document-operations.web.app npm run build
npx firebase-tools deploy --only hosting --project lazytodisciplinedapp
npm run verify:hosting -- https://document-operations.web.app
```
Rollback: Firebase console → Hosting → `document-operations` → release history → **Rollback** on the previous release (instant, no rebuild); or `git revert` the release commit, rebuild and redeploy. The previous release stays in history.
