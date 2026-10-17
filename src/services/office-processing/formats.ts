export type OfficeFormat = 'docx' | 'pptx' | 'xlsx'

export interface OfficeFormatDef {
  label: string
  mainPart: string
  mediaDir: string
  mime: string
  mainContentType: string
}

export const OFFICE: Record<OfficeFormat, OfficeFormatDef> = {
  docx: { label: 'Word (DOCX)', mainPart: 'word/document.xml', mediaDir: 'word/media/', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', mainContentType: 'wordprocessingml.document.main' },
  pptx: { label: 'PowerPoint (PPTX)', mainPart: 'ppt/presentation.xml', mediaDir: 'ppt/media/', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mainContentType: 'presentationml.presentation.main' },
  xlsx: { label: 'Excel (XLSX)', mainPart: 'xl/workbook.xml', mediaDir: 'xl/media/', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mainContentType: 'spreadsheetml.sheet.main' },
}

export const MACRO_EXTENSIONS = /\.(docm|xlsm|pptm|dotm|xltm|potm)$/i
