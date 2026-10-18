import { lazy, Suspense } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { BRAND } from '@/config/brand'

const HomePage = lazy(() => import('@/pages/HomePage'))
const ToolsPage = lazy(() => import('@/pages/ToolsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const named = <K extends string>(k: K, load: () => Promise<Record<K, React.ComponentType>>) =>
  lazy(async () => ({ default: (await load())[k] }))
const PrivacyPage = named('PrivacyPage', () => import('@/pages/StaticPages'))
const TermsPage = named('TermsPage', () => import('@/pages/StaticPages'))
const AboutPage = named('AboutPage', () => import('@/pages/StaticPages'))
const ContactPage = named('ContactPage', () => import('@/pages/StaticPages'))

const ImageCompressorPage = named('ImageCompressorPage', () => import('@/features/image-tools/ImageToolPages'))
const ImageResizerPage = named('ImageResizerPage', () => import('@/features/image-tools/ImageToolPages'))
const ImageConverterPage = named('ImageConverterPage', () => import('@/features/image-tools/ImageToolPages'))
const ImageToPdfPage = lazy(() => import('@/features/image-to-pdf/ImageToPdfPage'))

const MergePdfPage = lazy(() => import('@/features/pdf-tools/MergePdfPage'))
const CompressPdfPage = lazy(() => import('@/features/pdf-tools/CompressPdfPage'))
const SplitPdfPage = named('SplitPdfPage', () => import('@/features/pdf-tools/PageOpsPages'))
const ExtractPdfPagesPage = named('ExtractPdfPagesPage', () => import('@/features/pdf-tools/PageOpsPages'))
const RotatePdfPage = named('RotatePdfPage', () => import('@/features/pdf-tools/PageOpsPages'))

const ZipToolsPage = lazy(() => import('@/features/zip-tools/ZipToolsPage'))
const DocxOptimizerPage = named('DocxOptimizerPage', () => import('@/features/office-optimizer/OfficeOptimizerPage'))
const PptxOptimizerPage = named('PptxOptimizerPage', () => import('@/features/office-optimizer/OfficeOptimizerPage'))
const XlsxOptimizerPage = named('XlsxOptimizerPage', () => import('@/features/office-optimizer/OfficeOptimizerPage'))

const OdfOptimizerPage = named('OdfOptimizerPage', () => import('@/features/office-optimizer/OfficeOptimizerPage'))
const EpubOptimizerPage = named('EpubOptimizerPage', () => import('@/features/office-optimizer/OfficeOptimizerPage'))

const wrap = (el: React.ReactNode) => <Suspense fallback={<p className="p-8 text-center">Loading…</p>}>{el}</Suspense>

/** Add a route here only when its tool is functional (and mark it 'available' in tools/registry.ts). */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: wrap(<HomePage />) },
      { path: 'tools', element: wrap(<ToolsPage />) },
      { path: 'image-compressor', element: wrap(<ImageCompressorPage />) },
      { path: 'image-resizer', element: wrap(<ImageResizerPage />) },
      { path: 'image-converter', element: wrap(<ImageConverterPage />) },
      { path: 'image-to-pdf', element: wrap(<ImageToPdfPage />) },
      { path: 'merge-pdf', element: wrap(<MergePdfPage />) },
      { path: 'split-pdf', element: wrap(<SplitPdfPage />) },
      { path: 'rotate-pdf', element: wrap(<RotatePdfPage />) },
      { path: 'extract-pdf-pages', element: wrap(<ExtractPdfPagesPage />) },
      { path: 'pdf-compressor', element: wrap(<CompressPdfPage />) },
      { path: 'docx-optimizer', element: wrap(<DocxOptimizerPage />) },
      { path: 'pptx-optimizer', element: wrap(<PptxOptimizerPage />) },
      { path: 'xlsx-optimizer', element: wrap(<XlsxOptimizerPage />) },
      { path: 'odf-optimizer', element: wrap(<OdfOptimizerPage />) },
      { path: 'epub-optimizer', element: wrap(<EpubOptimizerPage />) },
      { path: 'zip-tools', element: wrap(<ZipToolsPage />) },
      { path: 'privacy', element: wrap(<PrivacyPage />) },
      { path: 'terms', element: wrap(<TermsPage />) },
      { path: 'about', element: wrap(<AboutPage />) },
      ...(BRAND.contactEmail ? [{ path: 'contact', element: wrap(<ContactPage />) }] : []),
      { path: '404', element: wrap(<NotFoundPage />) },
      { path: '*', element: wrap(<NotFoundPage />) },
    ],
  },
]

export const router = createBrowserRouter(routes)
