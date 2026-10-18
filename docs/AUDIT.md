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
- No public contact address yet: the Contact page and footer link are hidden until `BRAND.contactEmail` is set.
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

## 9. QA follow-up (2026-10-18): fixes and test plan
Issues from the QA pass on the deployed site, in priority order. All are fixed in the working tree, **not yet deployed**.

| # | Issue | Root cause | Fix | Regression tests |
|---|---|---|---|---|
| 1 (High) | Balanced/Low Size turned a colourful PNG screenshot into "PNG reduced to 2 colours", nearly blank | Median cut split each box at the pixel median; when a dominant colour (a white UI background) sorted last, the right half was empty and the unchanged box was "split" again until the palette was full of empty boxes. Reproduced on the live site: `fixtures/ui-screenshot.png` became **1 colour, 185 B** | Cut clamped so both halves are non-empty (`png.ts`); box ranges cached (≈3.5× faster). New safeguard: a reduced palette is only offered if it still looks like the source (`looksLikeSource`: ≥ 26 dB PSNR **and** ≤ 1% of pixels visibly off), otherwise lossless only, or the original is kept. PSNR alone is not enough: the 1-colour result still scored 18 dB because the white stayed white | Unit: screenshot keeps 256/128 colours (≥ 45 dB), dominant-colour split, gate rejects collapse and posterization. E2E: Balanced/Low Size on the screenshot (max pixel diff < 40), gate fallback is pixel-identical |
| 2 (Medium) | Quality showed 90%/lossless on one visit, 75%/256 colours on another | The default was already 75% on every fresh load (live bundle checked). But moving the slider always selected "Balanced", so at 90% the label said "lossless" while the Balanced button and help text said "75%; 256 colours" | Preset is derived from the quality, so button, label and help text always agree; any other value is "Custom". Settings start at Balanced on every visit (no persistence). Resizer/Converter keep 90% on purpose | E2E: default, slider-to-preset, Custom, reset after navigating away |
| 3 (Low) | Contact page was a placeholder | No contact address exists yet | `BRAND.contactEmail` (brand.ts): until it is set, there is no route, footer link or sitemap entry; setting it publishes a real page | E2E: no footer link, `/contact` is 404 |
| 4 (Low) | Archive tools missing from the header | Header links were hard-coded | Header links generated from `CATEGORY_LABEL`. Full header from 1024 px (the 4th link wrapped labels at 768–880 px); menu button below. Only the current category gets `aria-current` (NavLink marked all of them on `/tools`) | E2E: all four categories, desktop and mobile, current marking |
| 5 | Tools search dropped keystrokes | **Real bug, not an automation artifact**: the field was bound to the URL, which React Router updates in a transition; a controlled input re-renders with the stale value while that is pending ("zip" became "p" on mobile, "zp" on desktop) | Field owns its text and filters instantly; the URL is written after 250 ms of no typing; external changes (header search, back/forward) still update the field | E2E: fast typing (stress-tested 40×), query kept across category change, header search replaces it |

Also fixed: "1 colours" plural; a lossy note being removed by `notes.pop()` when the lossy attempt was exact (it could drop an unrelated note such as "first frame only").

### Test plan for areas the QA pass did not cover
| Area | Covered by | Status |
|---|---|---|
| Files over 100 MB; more than 50 files | `e2e/limits.spec.ts` (real sparse 101 MB file; 52 files, then 1 more) | **added** |
| Corrupt and empty files | `image-compression.spec.ts` (invalid, corrupt, truncated), `quality.spec.ts`, `zip-tools.spec.ts` (empty), PDF tool specs | covered |
| Encrypted/password-protected PDFs; PDFs without JPEGs | `pdf-compressor.spec.ts` (encrypted/signed/truncated/fake; text-only PDF says nothing can be reduced), merge/split/rotate/extract specs | covered |
| Animated GIF, APNG, WebP and first-frame-only | `image-compression.spec.ts`, `image-formats.spec.ts`, `image-to-pdf.spec.ts` | covered |
| JPG/WebP compression, transparent PNGs, HEIC rejection | `image-compression.spec.ts` (JPEG, WebP, alpha with 4 MIME variants), `image-formats.spec.ts` (HEIC message) | covered |
| TAR/GZIP inspection; `../` and other unsafe ZIP paths | `zip-tools.spec.ts` (unsafe paths, TAR traversal and links, bombs), `office-zip.spec.ts` (zip-slip) | covered |
| Download buttons and downloaded-file integrity | every tool spec reads the download back (format, dimensions, bytes, pixel equality) | covered |
| Mobile layout | all routes load without horizontal scroll on Pixel 7 (`navigation.spec.ts`); header checked at 768–1280 px by hand | covered (emulated); real devices **not tested** |
| Keyboard accessibility | `quality.spec.ts` (skip link, mobile menu by keyboard), axe on every route | partial: full keyboard-only tool workflows **not tested** |
| Header search box | `navigation.spec.ts` (header search on the tools page) | **added** |
| Non-Chromium browsers, screen readers | none | **not tested** (see §6) |

Run on 2026-10-18 against the local production build (`vite preview`): typecheck pass, **241** unit tests passed, **573** Playwright tests passed + 1 skipped (desktop + mobile Chrome). Not re-run on the Firebase emulator: `firebase.json` is unchanged.
