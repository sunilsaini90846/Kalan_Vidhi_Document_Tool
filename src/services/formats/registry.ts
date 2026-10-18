import type { DetectedKind } from '@/services/file-validation/signatures'

/** Where a format stands in THIS (browser-only, static) architecture. */
export type SupportLevel =
  | 'supported'              // implemented and tested
  | 'after-implementation'   // feasible with the current stack, not built yet
  | 'specialized-engine'     // needs a large/licensed engine we have not adopted
  | 'not-in-browser'         // cannot be done reliably in the browser-only architecture
  | 'not-planned'

export type FormatGroup = 'image' | 'document' | 'archive' | 'media'

export interface FormatEntry {
  id: string
  label: string
  group: FormatGroup
  extensions: string[]
  /** Signature kind returned by detectKind(); undefined for formats found by inspecting a container. */
  kind?: DetectedKind
  level: SupportLevel
  /** We can positively identify it by content. */
  recognized: boolean
  /** We can read the pixels/contents (may depend on the browser). */
  decodable: boolean
  /** Same-format output that is smaller than the input (the "compress" operation). */
  compressible: boolean
  /** Output formats this format can be converted to. */
  convertibleTo: string[]
  mergeable: boolean
  extractable: boolean
  /** Tool slugs that accept it. A format is never usable outside these. */
  tools: string[]
  /** Engine / library evaluation and limits, shown to maintainers and used in user messages. */
  note: string
  /** Shown to a user who drops this format on a tool that cannot take it. */
  userMessage?: string
}

const RASTER_OUT = ['png', 'jpeg', 'webp']

export const FORMATS: FormatEntry[] = [
  { id: 'jpeg', label: 'JPEG', group: 'image', extensions: ['jpg', 'jpeg'], kind: 'jpeg', level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: RASTER_OUT, mergeable: true, extractable: false,
    tools: ['image-compressor', 'image-resizer', 'image-converter', 'image-to-pdf', 'pdf-compressor'], note: 'Browser decoder + canvas encoder. CMYK JPEG is not re-encoded inside PDF/Office files. EXIF is applied then dropped.' },
  { id: 'png', label: 'PNG', group: 'image', extensions: ['png'], kind: 'png', level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: RASTER_OUT, mergeable: true, extractable: false,
    tools: ['image-compressor', 'image-resizer', 'image-converter', 'image-to-pdf'], note: 'Own PNG encoder (fflate deflate level 9, adaptive filters) with optional palette quantization; alpha preserved.' },
  { id: 'webp', label: 'WebP', group: 'image', extensions: ['webp'], kind: 'webp', level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: RASTER_OUT, mergeable: true, extractable: false,
    tools: ['image-compressor', 'image-resizer', 'image-converter', 'image-to-pdf'], note: 'Decode is universal; WebP encoding needs browser support (feature-detected). Animated WebP is detected and never silently flattened.' },
  { id: 'gif', label: 'GIF', group: 'image', extensions: ['gif'], kind: 'gif', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: true, extractable: false,
    tools: ['image-resizer', 'image-converter', 'image-to-pdf'], note: 'Static GIFs decode in the browser. Animated GIFs are detected by walking the block structure; only the first frame can be used, and only when the user opts in. No GIF encoder: converted, not compressed.',
    userMessage: 'GIF files can be converted or resized in the Image Converter / Resizer (output PNG, WebP or JPG); they cannot be re-compressed as GIF.' },
  { id: 'bmp', label: 'BMP', group: 'image', extensions: ['bmp'], kind: 'bmp', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: true, extractable: false,
    tools: ['image-resizer', 'image-converter', 'image-to-pdf'], note: 'Browser decoder (feature-detected). BMP is uncompressed, so converting to PNG/WebP/JPEG is the way to shrink it.',
    userMessage: 'BMP files are uncompressed. Use the Image Converter to turn them into PNG, WebP or JPG.' },
  { id: 'tiff', label: 'TIFF', group: 'image', extensions: ['tif', 'tiff'], kind: 'tiff', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: false, extractable: false,
    tools: ['image-resizer', 'image-converter'], note: 'Decoded with utif2 (MIT), lazy-loaded only when a TIFF is opened. First page only; multi-page TIFFs are reported as such. Browsers cannot decode TIFF natively.',
    userMessage: 'TIFF files can be converted in the Image Converter (first page only).' },
  { id: 'avif', label: 'AVIF', group: 'image', extensions: ['avif'], kind: 'avif', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: false, extractable: false,
    tools: ['image-resizer', 'image-converter'], note: 'Decoded by the browser (feature-detected at runtime). Browsers cannot encode AVIF from canvas, so AVIF is input-only. Animated AVIF (avis) is detected and refused.',
    userMessage: 'AVIF files can be converted or resized in the Image Converter / Resizer (output PNG, WebP or JPG); AVIF output is not available in browsers.' },
  { id: 'svg', label: 'SVG', group: 'image', extensions: ['svg'], kind: 'svg', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: false, extractable: false,
    tools: ['image-resizer', 'image-converter'], note: 'Rasterized via <img> (scripts never run). Files containing <script>, foreignObject, event handlers, external references, DOCTYPE/ENTITY or javascript: URLs are rejected before rendering. Rasterization runs on the main thread (no DOM in workers), size-capped.',
    userMessage: 'SVG files can be converted to PNG, WebP or JPG in the Image Converter.' },
  { id: 'ico', label: 'ICO', group: 'image', extensions: ['ico'], kind: 'ico', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: false, extractable: false,
    tools: ['image-resizer', 'image-converter'], note: 'Browser decoder (feature-detected); the browser picks one size from multi-size icons. Input-only.' },
  { id: 'apng', label: 'APNG', group: 'image', extensions: ['png', 'apng'], kind: 'png', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: RASTER_OUT, mergeable: false, extractable: false,
    tools: ['image-compressor', 'image-resizer', 'image-converter'], note: 'A PNG variant, detected by its acTL chunk. Animation cannot be preserved by canvas, so APNG is refused unless the user opts in to first-frame-only output.' },
  { id: 'heic', label: 'HEIC / HEIF', group: 'image', extensions: ['heic', 'heif'], kind: 'heic', level: 'specialized-engine', recognized: true, decodable: false, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: [],
    note: 'Needs libheif (LGPL-3.0, ~1.5 MB WASM, via libheif-js/heic2any) and an HEVC decoder with patent-licensing considerations. Not adopted: LGPL redistribution obligations were not evaluated for this project.',
    userMessage: 'HEIC/HEIF is not supported yet: it needs a specialized decoder. On iPhone, share photos as “Most Compatible” (JPEG), or export as JPEG first.' },

  { id: 'pdf', label: 'PDF', group: 'document', extensions: ['pdf'], kind: 'pdf', level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: true, extractable: true,
    tools: ['pdf-compressor', 'merge-pdf', 'split-pdf', 'rotate-pdf', 'extract-pdf-pages'], note: 'pdf-lib (MIT). "Compress" = JPEG image recompression + object streams only; text, fonts, vectors and non-JPEG images are untouched. Encrypted and digitally signed PDFs are refused. Ghostscript/MuPDF WASM are AGPL and not adopted.' },
  { id: 'docx', label: 'DOCX', group: 'document', extensions: ['docx'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['docx-optimizer'], note: 'OOXML package; embedded JPEG/PNG images only, all other parts byte-identical. Macro-enabled refused. No conversion to PDF.' },
  { id: 'pptx', label: 'PPTX', group: 'document', extensions: ['pptx'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['pptx-optimizer'], note: 'As DOCX.' },
  { id: 'xlsx', label: 'XLSX', group: 'document', extensions: ['xlsx'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['xlsx-optimizer'], note: 'As DOCX. Formulas and sheet data are never modified.' },
  { id: 'odt', label: 'ODT', group: 'document', extensions: ['odt'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['odf-optimizer'], note: 'OpenDocument package: images under Pictures/ only; the stored `mimetype` entry stays first and uncompressed.' },
  { id: 'ods', label: 'ODS', group: 'document', extensions: ['ods'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['odf-optimizer'], note: 'As ODT.' },
  { id: 'odp', label: 'ODP', group: 'document', extensions: ['odp'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['odf-optimizer'], note: 'As ODT.' },
  { id: 'epub', label: 'EPUB', group: 'document', extensions: ['epub'], level: 'supported', recognized: true, decodable: true, compressible: true, convertibleTo: [], mergeable: false, extractable: false, tools: ['epub-optimizer'], note: 'EPUB container: JPEG/PNG images anywhere in the package, same filenames, so manifest references stay valid. DRM-encrypted EPUBs (META-INF/encryption.xml) are refused.' },
  { id: 'rtf', label: 'RTF', group: 'document', extensions: ['rtf'], kind: 'rtf', level: 'not-planned', recognized: true, decodable: false, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: [],
    note: 'RTF is plain text with images embedded as hex; safe optimization needs a full RTF parser and gives little benefit for text.',
    userMessage: 'RTF files are not supported: there is no safe way to shrink them in the browser. You can put them in a ZIP with ZIP Tools.' },
  { id: 'txt', label: 'TXT', group: 'document', extensions: ['txt'], kind: 'text', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: ['zip-tools'], note: 'Plain text has no standalone tool; ZIP Tools can package it (deflate).',
    userMessage: 'Plain text files have no compression tool of their own. ZIP Tools can package them into a smaller ZIP.' },

  { id: 'zip', label: 'ZIP', group: 'archive', extensions: ['zip'], kind: 'zip', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: [], mergeable: false, extractable: true, tools: ['zip-tools'], note: 'fflate (MIT). Inflated-byte accounting, path checks, no ZIP64/encryption.' },
  { id: 'gzip', label: 'GZIP (.gz, .tgz)', group: 'archive', extensions: ['gz', 'tgz'], kind: 'gzip', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: [], mergeable: false, extractable: true, tools: ['zip-tools'], note: 'fflate gunzip with a streaming size cap. A .tar.gz is opened as a TAR listing.' },
  { id: 'tar', label: 'TAR', group: 'archive', extensions: ['tar'], kind: 'tar', level: 'supported', recognized: true, decodable: true, compressible: false, convertibleTo: [], mergeable: false, extractable: true, tools: ['zip-tools'], note: 'Own minimal ustar reader: regular files only; links/devices are listed but never extracted; unsafe paths blocked.' },
  { id: '7z', label: '7Z', group: 'archive', extensions: ['7z'], kind: '7z', level: 'specialized-engine', recognized: true, decodable: false, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: [],
    note: 'Needs a WASM engine (7-zip LGPL / libarchive BSD, 1–2 MB). Not adopted yet.', userMessage: '7Z archives are not supported yet: they need a specialized engine.' },
  { id: 'rar', label: 'RAR', group: 'archive', extensions: ['rar'], kind: 'rar', level: 'specialized-engine', recognized: true, decodable: false, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: [],
    note: 'Extraction needs unrar/libarchive WASM; creating RAR is not permitted by the unrar license. Not adopted.', userMessage: 'RAR archives are not supported yet: they need a specialized engine.' },

  ...(['mp4', 'mov', 'webm', 'mp3', 'wav', 'flac'] as const).map((id): FormatEntry => ({
    id, label: id.toUpperCase(), group: 'media', extensions: [id], kind: id, level: 'specialized-engine', recognized: true, decodable: false, compressible: false, convertibleTo: [], mergeable: false, extractable: false, tools: [],
    note: 'Audio/video recompression needs ffmpeg.wasm (LGPL/GPL builds, ~30 MB, heavy memory use) or per-codec WebCodecs encoders with uneven browser support. Out of scope for this release.',
    userMessage: `${id.toUpperCase()} audio/video files are not supported: media compression needs a large specialized engine.`,
  })),
]

const byId = new Map(FORMATS.map((f) => [f.id, f]))
export const getFormat = (id: string) => byId.get(id)
export const formatByKind = (kind: DetectedKind) => FORMATS.find((f) => f.kind === kind && f.id !== 'apng')
export const supportedFormats = () => FORMATS.filter((f) => f.level === 'supported')

/** Signature kinds each tool accepts: the single source for dropzone rules. */
export const TOOL_ACCEPTS = {
  'image-compressor': ['jpeg', 'png', 'webp'],
  'image-resizer': ['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'svg', 'ico'],
  'image-converter': ['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif', 'svg', 'ico'],
  'image-to-pdf': ['jpeg', 'png', 'webp', 'gif', 'bmp'],
  'zip-tools': ['zip', 'gzip', 'tar'],
  'pdf-compressor': ['pdf'],
  'merge-pdf': ['pdf'],
  'split-pdf': ['pdf'],
  'rotate-pdf': ['pdf'],
  'extract-pdf-pages': ['pdf'],
} as const satisfies Record<string, readonly DetectedKind[]>

export type ToolAcceptSlug = keyof typeof TOOL_ACCEPTS

/** Human-readable list ("JPG, PNG, WebP") for a tool, derived from the registry so UI copy cannot drift. */
export function acceptedLabels(kinds: readonly DetectedKind[]): string {
  return kinds.map((k) => formatByKind(k)?.label.replace('JPEG', 'JPG') ?? k).join(', ')
}

/** Why a recognised-but-unaccepted file cannot be used here; null when we do not know the format at all. */
export function explainUnsupported(kind: DetectedKind, fileName: string, toolAccepts?: readonly DetectedKind[]): string | null {
  const f = formatByKind(kind)
  if (!f) return null
  // Text has no signature, so "looks like text" must not be reported as identity for a file named like something else.
  if (kind === 'text' && !/\.(txt|text|md|csv|log)$/i.test(fileName)) {
    return toolAccepts
      ? `"${fileName}" is not a supported file type for this tool: its contents look like plain text, not ${acceptedLabels(toolAccepts)}. The file may be damaged or have the wrong extension.`
      : `"${fileName}" is not supported: its contents look like plain text, not a recognized image, document or archive. The file may be damaged or have the wrong extension.`
  }
  const accepted = toolAccepts ? `This tool accepts ${acceptedLabels(toolAccepts)}. ` : ''
  return `"${fileName}" is a ${f.label} file. ${accepted}${f.userMessage ?? (f.level === 'supported' ? 'Use the matching tool from the tools list.' : f.note)}`
}

/** Dropzone rules for a tool: accepted kinds plus a registry-backed explanation for recognised-but-unsupported files. */
export function rulesFor(slug: ToolAcceptSlug) {
  const accept = TOOL_ACCEPTS[slug]
  return { accept, explain: (kind: DetectedKind, name: string) => explainUnsupported(kind, name, accept) }
}
