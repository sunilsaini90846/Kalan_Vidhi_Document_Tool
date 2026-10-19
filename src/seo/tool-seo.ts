/**
 * Search copy for every tool, keyed by registry slug. `title` is the page part only: the brand is appended by
 * `titleFor`, so keep it short enough that the full title stays under ~65 characters.
 * Describe what the tool really does (same limits as the page itself); never promise a saving percentage.
 */
export interface ToolSeo { title: string; description: string }

export const TOOL_SEO: Record<string, ToolSeo> = {
  'image-compressor': {
    title: 'Compress JPG, PNG & WebP Images Online',
    description: 'Compress JPG, PNG and WebP images free, right in your browser. See the real before and after size of every file. Nothing is uploaded.',
  },
  'image-to-pdf': {
    title: 'Convert Images to PDF Online',
    description: 'Combine JPG, PNG, WebP, GIF and BMP images into one PDF. Reorder, rotate, pick the page size and layout. Runs in your browser, no upload.',
  },
  'image-resizer': {
    title: 'Resize Images Online (JPG, PNG, WebP)',
    description: 'Resize images by maximum width and height while keeping the aspect ratio. Supports JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, ICO and SVG. No upload.',
  },
  'image-converter': {
    title: 'Image Converter: TIFF, AVIF, GIF to JPG',
    description: 'Convert GIF, BMP, TIFF, AVIF, ICO, SVG, JPG, PNG and WebP images to JPG, PNG or WebP locally in your browser. Your files never leave your device.',
  },
  'pdf-compressor': {
    title: 'Compress PDF Online: Reduce PDF Size',
    description: 'Reduce the size of PDFs that contain photos or scans by recompressing their JPEG images. Free, private, and honest about what changed.',
  },
  'merge-pdf': {
    title: 'Merge PDF Files Online',
    description: 'Combine several PDF files into one, in the order you choose. Free and private: the merge happens in your browser and nothing is uploaded.',
  },
  'split-pdf': {
    title: 'Split PDF by Page or Range Online',
    description: 'Split a PDF into single pages, page ranges or specific pages. Several outputs download as one ZIP. Runs in your browser, no upload.',
  },
  'rotate-pdf': {
    title: 'Rotate PDF Pages Online',
    description: 'Rotate all pages of a PDF, or only the ones you choose, and download the result. Free, private and processed entirely in your browser.',
  },
  'extract-pdf-pages': {
    title: 'Extract or Delete PDF Pages Online',
    description: 'Keep, delete or reorder pages to build a new PDF from the pages you choose. Free, private and processed entirely in your browser.',
  },
  'docx-optimizer': {
    title: 'Reduce Word DOCX File Size',
    description: 'Shrink the embedded images in a Word DOCX file and keep every other part byte-for-byte identical. Free, private, runs in your browser.',
  },
  'pptx-optimizer': {
    title: 'Reduce PowerPoint PPTX File Size',
    description: 'Shrink the embedded images in a PowerPoint PPTX file and keep every other part byte-for-byte identical. Free, private, runs in your browser.',
  },
  'xlsx-optimizer': {
    title: 'Reduce Excel XLSX File Size',
    description: 'Shrink the embedded images in an Excel XLSX workbook and keep every other part byte-for-byte identical. Free, private, runs in your browser.',
  },
  'odf-optimizer': {
    title: 'Reduce ODT, ODS & ODP File Size',
    description: 'Shrink the embedded images in OpenDocument text, spreadsheet and presentation files. Free, private, and everything runs in your browser.',
  },
  'epub-optimizer': {
    title: 'Reduce EPUB File Size',
    description: 'Shrink the embedded images in an EPUB e-book while keeping the book structure intact. Free, private, and everything runs in your browser.',
  },
  'zip-tools': {
    title: 'Open, Extract & Create ZIP Files',
    description: 'Inspect ZIP, TAR and GZIP archives, extract single files safely, or create a ZIP. Free, private, and everything runs in your browser.',
  },
}
