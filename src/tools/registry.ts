import { FileImage, FileText, FileArchive, Files, Scissors, Minimize2, Shrink, RefreshCw, RotateCw, FileOutput, FileType2, Presentation, Sheet, type LucideIcon } from 'lucide-react'

export type ToolCategory = 'image' | 'pdf' | 'document' | 'archive'
export type ToolStatus = 'available' | 'coming-soon'

export interface ToolDef {
  slug: string
  name: string
  description: string
  formats: string
  category: ToolCategory
  status: ToolStatus
  popular?: boolean
  icon: LucideIcon
}

export const CATEGORY_LABEL: Record<ToolCategory, string> = {
  image: 'Image tools', pdf: 'PDF tools', document: 'Document tools', archive: 'Archive tools',
}

/**
 * Single source of truth. Flip `status` to 'available' only when the route in
 * router.tsx exists and the tool genuinely works end to end.
 */
export const TOOLS: ToolDef[] = [
  { slug: 'image-compressor', name: 'Image Compressor', description: 'Reduce JPG, PNG and WebP file size with before/after comparison.', formats: 'JPG, PNG, WebP', category: 'image', status: 'available', popular: true, icon: Minimize2 },
  { slug: 'image-to-pdf', name: 'Image to PDF', description: 'Combine multiple images into one PDF with page size and ordering controls.', formats: 'JPG, PNG, WebP', category: 'image', status: 'available', popular: true, icon: FileImage },
  { slug: 'image-resizer', name: 'Image Resizer', description: 'Resize images by dimensions while keeping aspect ratio.', formats: 'JPG, PNG, WebP', category: 'image', status: 'available', popular: true, icon: Shrink },
  { slug: 'image-converter', name: 'Image Converter', description: 'Convert between JPG, PNG and WebP.', formats: 'JPG, PNG, WebP', category: 'image', status: 'available', icon: RefreshCw },
  { slug: 'pdf-compressor', name: 'PDF Compressor', description: 'Optimize PDF size using real, documented optimizations.', formats: 'PDF', category: 'pdf', status: 'available', popular: true, icon: FileText },
  { slug: 'merge-pdf', name: 'Merge PDF', description: 'Combine several PDFs into one, in the order you choose.', formats: 'PDF', category: 'pdf', status: 'available', popular: true, icon: Files },
  { slug: 'split-pdf', name: 'Split PDF', description: 'Split by page, range or specific pages; download as ZIP.', formats: 'PDF', category: 'pdf', status: 'available', popular: true, icon: Scissors },
  { slug: 'rotate-pdf', name: 'Rotate PDF', description: 'Rotate selected or all pages.', formats: 'PDF', category: 'pdf', status: 'available', icon: RotateCw },
  { slug: 'extract-pdf-pages', name: 'Extract PDF Pages', description: 'Pull selected pages into a new PDF.', formats: 'PDF', category: 'pdf', status: 'available', icon: FileOutput },
  { slug: 'docx-optimizer', name: 'DOCX Optimizer', description: 'Optimize embedded images in Word documents.', formats: 'DOCX', category: 'document', status: 'available', icon: FileType2 },
  { slug: 'pptx-optimizer', name: 'PPTX Optimizer', description: 'Optimize embedded images in PowerPoint files.', formats: 'PPTX', category: 'document', status: 'available', icon: Presentation },
  { slug: 'xlsx-optimizer', name: 'XLSX Optimizer', description: 'Optimize embedded images in Excel workbooks.', formats: 'XLSX', category: 'document', status: 'available', icon: Sheet },
  { slug: 'zip-tools', name: 'ZIP Tools', description: 'Inspect, create and safely extract ZIP archives.', formats: 'ZIP', category: 'archive', status: 'available', icon: FileArchive },
]

export const availableTools = () => TOOLS.filter((t) => t.status === 'available')
