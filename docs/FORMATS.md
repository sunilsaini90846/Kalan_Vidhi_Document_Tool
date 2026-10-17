# Format support matrix

<!-- Generated from src/services/formats/registry.ts by `npm run docs:formats`. Do not edit by hand. -->

Support is **per tool and per operation**. A format recognized by content is not necessarily readable, and a readable format is not necessarily compressible. Columns:

- **Recognized**: identified by file signature (never by extension or MIME type alone).
- **Decodable**: the app can read it (some depend on the browser; checked at runtime).
- **Compress**: produces a smaller file in the *same* format.
- **Convert to**: output formats it can be converted to.
- **Merge / Extract**: can be combined into a PDF or merged / has contents that can be pulled out.
- **Tools**: the only tools that accept it.

## Images

| Format | Status | Recognized | Decodable | Compress | Convert to | Merge | Extract | Tools | Engine, limits and licensing |
|---|---|---|---|---|---|---|---|---|---|
| JPEG | Supported now | yes | yes | yes | png, jpeg, webp | yes | – | image-compressor, image-resizer, image-converter, image-to-pdf, pdf-compressor | Browser decoder + canvas encoder. CMYK JPEG is not re-encoded inside PDF/Office files. EXIF is applied then dropped. |
| PNG | Supported now | yes | yes | yes | png, jpeg, webp | yes | – | image-compressor, image-resizer, image-converter, image-to-pdf | Own PNG encoder (fflate deflate level 9, adaptive filters) with optional palette quantization; alpha preserved. |
| WebP | Supported now | yes | yes | yes | png, jpeg, webp | yes | – | image-compressor, image-resizer, image-converter, image-to-pdf | Decode is universal; WebP encoding needs browser support (feature-detected). Animated WebP is detected and never silently flattened. |
| GIF | Supported now | yes | yes | – | png, jpeg, webp | yes | – | image-resizer, image-converter, image-to-pdf | Static GIFs decode in the browser. Animated GIFs are detected by walking the block structure; only the first frame can be used, and only when the user opts in. No GIF encoder: converted, not compressed. |
| BMP | Supported now | yes | yes | – | png, jpeg, webp | yes | – | image-resizer, image-converter, image-to-pdf | Browser decoder (feature-detected). BMP is uncompressed, so converting to PNG/WebP/JPEG is the way to shrink it. |
| TIFF | Supported now | yes | yes | – | png, jpeg, webp | – | – | image-resizer, image-converter | Decoded with utif2 (MIT), lazy-loaded only when a TIFF is opened. First page only; multi-page TIFFs are reported as such. Browsers cannot decode TIFF natively. |
| AVIF | Supported now | yes | yes | – | png, jpeg, webp | – | – | image-resizer, image-converter | Decoded by the browser (feature-detected at runtime). Browsers cannot encode AVIF from canvas, so AVIF is input-only. Animated AVIF (avis) is detected and refused. |
| SVG | Supported now | yes | yes | – | png, jpeg, webp | – | – | image-resizer, image-converter | Rasterized via <img> (scripts never run). Files containing <script>, foreignObject, event handlers, external references, DOCTYPE/ENTITY or javascript: URLs are rejected before rendering. Rasterization runs on the main thread (no DOM in workers), size-capped. |
| ICO | Supported now | yes | yes | – | png, jpeg, webp | – | – | image-resizer, image-converter | Browser decoder (feature-detected); the browser picks one size from multi-size icons. Input-only. |
| APNG | Supported now | yes | yes | – | png, jpeg, webp | – | – | image-compressor, image-resizer, image-converter | A PNG variant, detected by its acTL chunk. Animation cannot be preserved by canvas, so APNG is refused unless the user opts in to first-frame-only output. |
| HEIC / HEIF | Requires a specialized engine | yes | – | – | – | – | – | – | Needs libheif (LGPL-3.0, ~1.5 MB WASM, via libheif-js/heic2any) and an HEVC decoder with patent-licensing considerations. Not adopted: LGPL redistribution obligations were not evaluated for this project. |

## Documents

| Format | Status | Recognized | Decodable | Compress | Convert to | Merge | Extract | Tools | Engine, limits and licensing |
|---|---|---|---|---|---|---|---|---|---|
| PDF | Supported now | yes | yes | yes | – | yes | yes | pdf-compressor, merge-pdf, split-pdf, rotate-pdf, extract-pdf-pages | pdf-lib (MIT). "Compress" = JPEG image recompression + object streams only; text, fonts, vectors and non-JPEG images are untouched. Encrypted and digitally signed PDFs are refused. Ghostscript/MuPDF WASM are AGPL and not adopted. |
| DOCX | Supported now | yes | yes | yes | – | – | – | docx-optimizer | OOXML package; embedded JPEG/PNG images only, all other parts byte-identical. Macro-enabled refused. No conversion to PDF. |
| PPTX | Supported now | yes | yes | yes | – | – | – | pptx-optimizer | As DOCX. |
| XLSX | Supported now | yes | yes | yes | – | – | – | xlsx-optimizer | As DOCX. Formulas and sheet data are never modified. |
| ODT | Supported now | yes | yes | yes | – | – | – | odf-optimizer | OpenDocument package: images under Pictures/ only; the stored `mimetype` entry stays first and uncompressed. |
| ODS | Supported now | yes | yes | yes | – | – | – | odf-optimizer | As ODT. |
| ODP | Supported now | yes | yes | yes | – | – | – | odf-optimizer | As ODT. |
| EPUB | Supported now | yes | yes | yes | – | – | – | epub-optimizer | EPUB container: JPEG/PNG images anywhere in the package, same filenames, so manifest references stay valid. DRM-encrypted EPUBs (META-INF/encryption.xml) are refused. |
| RTF | Not planned | yes | – | – | – | – | – | – | RTF is plain text with images embedded as hex; safe optimization needs a full RTF parser and gives little benefit for text. |
| TXT | Supported now | yes | yes | – | – | – | – | zip-tools | Plain text has no standalone tool; ZIP Tools can package it (deflate). |

## Archives

| Format | Status | Recognized | Decodable | Compress | Convert to | Merge | Extract | Tools | Engine, limits and licensing |
|---|---|---|---|---|---|---|---|---|---|
| ZIP | Supported now | yes | yes | – | – | – | yes | zip-tools | fflate (MIT). Inflated-byte accounting, path checks, no ZIP64/encryption. |
| GZIP (.gz, .tgz) | Supported now | yes | yes | – | – | – | yes | zip-tools | fflate gunzip with a streaming size cap. A .tar.gz is opened as a TAR listing. |
| TAR | Supported now | yes | yes | – | – | – | yes | zip-tools | Own minimal ustar reader: regular files only; links/devices are listed but never extracted; unsafe paths blocked. |
| 7Z | Requires a specialized engine | yes | – | – | – | – | – | – | Needs a WASM engine (7-zip LGPL / libarchive BSD, 1–2 MB). Not adopted yet. |
| RAR | Requires a specialized engine | yes | – | – | – | – | – | – | Extraction needs unrar/libarchive WASM; creating RAR is not permitted by the unrar license. Not adopted. |

## Audio / video

| Format | Status | Recognized | Decodable | Compress | Convert to | Merge | Extract | Tools | Engine, limits and licensing |
|---|---|---|---|---|---|---|---|---|---|
| MP4 | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |
| MOV | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |
| WEBM | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |
| MP3 | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |
| WAV | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |
| FLAC | Requires a specialized engine | yes | – | – | – | – | – | – | Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release. |

