# Kalan Vidhi Doc Tool – privacy-first file compression/conversion (static React app)
Brand: "Kalan Vidhi" is the parent brand, "Doc Tool" the product. Names live in `src/config/brand.ts` (never hard-code them).

## Stack
React 19 + TypeScript (strict) + Vite 6 + React Router 7 + Tailwind 4. Tests: Vitest + RTL, Playwright for e2e.
Processing: browser-only (Web Workers, Canvas, pdf-lib, browser-image-compression, fflate). Host: Firebase Hosting (static).
Node 20.17 locally → keep Vite 6 / Vitest 4.1 (Vite 7+/Vitest 5 need Node ≥20.19/22).

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` · `npm run preview` · `npm run e2e` · `npm run verify:hosting -- <url>`
Release verification (Firebase emulator + e2e under real headers) is in README → "Release checklist".

## Hard rules
- No backend, database, auth, analytics or external scripts. Files never leave the browser.
- Never show fake progress/savings; report real output sizes; validate output before claiming success.
- Validate by file signature (magic bytes), not extension/MIME alone. Treat uploads as untrusted.
- A tool is only routed/linked when functional; otherwise it is `status: 'coming-soon'` in `src/tools/registry.ts`.
- Keep UI, processing services, workers, validation and downloads separate; share validation/download/progress logic.
- Lazy-load every tool route and its processing libs.
- Heavy processing goes through `src/workers/handlers.ts` + `WorkerClient`, never the main thread. Add new operations there.
- Every tool has its own spec, `e2e/tools/<slug>.spec.ts` (enforced by `src/tests/tool-coverage.test.ts`); shared builders are in `e2e/tool-kit.ts`, fixtures in `fixtures/`. Tests use real files and read the downloaded output back; e2e/quality.spec.ts also runs axe on every route, so new routes must be added to its list.
- Don't commit `.firebaserc` or `.env`. Keep the `/assets/**` header rule last in firebase.json (later rules win) and run `verify:hosting` after any header change.

## Layout
`src/app` shell/router · `src/tools` registry · `src/features/<tool>` · `src/services/*` engines · `src/workers` · `src/components/*` shared UI.
