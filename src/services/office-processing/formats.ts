export type OfficeFormat = 'docx' | 'pptx' | 'xlsx' | 'odt' | 'ods' | 'odp' | 'epub'
export type PackageFamily = 'ooxml' | 'odf' | 'epub'

export interface OfficeFormatDef {
  label: string
  family: PackageFamily
  /** A part every valid file of this format has. */
  mainPart: string
  mime: string
  /** OOXML: substring of the main part's content type. ODF/EPUB: the exact `mimetype` entry text. */
  signature: string
  /** Which entries are images this tool may re-encode. */
  isMedia: (name: string) => boolean
}

const ooxml = (label: string, mainPart: string, mime: string, signature: string, dir: string): OfficeFormatDef =>
  ({ label, family: 'ooxml', mainPart, mime, signature, isMedia: (n) => n.startsWith(dir) })
const odf = (label: string, mime: string): OfficeFormatDef =>
  ({ label, family: 'odf', mainPart: 'content.xml', mime, signature: mime, isMedia: (n) => n.startsWith('Pictures/') })

export const OFFICE: Record<OfficeFormat, OfficeFormatDef> = {
  docx: ooxml('Word (DOCX)', 'word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'wordprocessingml.document.main', 'word/media/'),
  pptx: ooxml('PowerPoint (PPTX)', 'ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'presentationml.presentation.main', 'ppt/media/'),
  xlsx: ooxml('Excel (XLSX)', 'xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheetml.sheet.main', 'xl/media/'),
  odt: odf('OpenDocument Text (ODT)', 'application/vnd.oasis.opendocument.text'),
  ods: odf('OpenDocument Spreadsheet (ODS)', 'application/vnd.oasis.opendocument.spreadsheet'),
  odp: odf('OpenDocument Presentation (ODP)', 'application/vnd.oasis.opendocument.presentation'),
  epub: { label: 'EPUB e-book', family: 'epub', mainPart: 'META-INF/container.xml', mime: 'application/epub+zip', signature: 'application/epub+zip',
    isMedia: (n) => !n.startsWith('META-INF/') && /\.(jpe?g|png)$/i.test(n) },
}

export const MACRO_EXTENSIONS = /\.(docm|xlsm|pptm|dotm|xltm|potm)$/i

/** Maps a file name to its format, restricted to the formats a page handles. */
export function formatFromName(name: string, allowed: readonly OfficeFormat[]): OfficeFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  return allowed.find((f) => f === ext) ?? null
}
