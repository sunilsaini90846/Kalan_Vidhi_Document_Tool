# PDF engine evaluation

What the PDF Compressor does today: re-encodes **JPEG images** inside the PDF through the browser (RGB / Gray / ICC-based, no `Decode`/`Mask`, not stencils) and saves with object streams. A replacement is kept only if it is at least 5% smaller. This is **image recompression, not full PDF optimization**: text, fonts, vector content, CMYK/Indexed and non-JPEG images are untouched, shared images are rewritten once (they are one object), and encrypted or digitally signed files are refused.

| Engine | Licence | Fit | Decision |
|---|---|---|---|
| pdf-lib | MIT | Structure editing, page copy, object streams. No image/stream optimization. | **In use** |
| Ghostscript (WASM builds) | AGPL-3.0 (or commercial) | Real optimizer (downsampling, font subsetting, stream recompression). | Not adopted: AGPL network/distribution obligations not evaluated for this project. |
| MuPDF (WASM) | AGPL-3.0 (or commercial) | Cleaning, garbage collection, recompression. | Not adopted: same. |
| qpdf (WASM builds) | Apache-2.0 | Stream recompression (flate), object streams, linearization; no image resampling. | Candidate for a future "lossless structure optimization" step. Verify the specific WASM build's licence and size first. |
| PDFium (WASM builds) / pdf.js | BSD-3 / Apache-2.0 | Rendering, so page previews and render-based rasterized compression. | Candidate for page preview. Rasterizing pages would destroy text/selectability, so it must never be called "compression" without that warning. |

Memory: pdf-lib holds the whole document in memory (plus the structured-clone copy sent to the worker); a 100 MB PDF can need several hundred MB. Any WASM engine adds its own heap (often 100 MB+ for Ghostscript/MuPDF), a concern on mobile browsers.
Before adding any AGPL component: decide whether distributing the app as a static site triggers source-offer obligations, and document it. This file is an engineering evaluation from the licences' published terms, not legal advice; verify current terms before adopting.
