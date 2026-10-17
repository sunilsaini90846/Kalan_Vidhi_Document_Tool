import type { ReactNode } from 'react'
import { Seo } from '@/components/common/Seo'

function Page({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <Seo title={title} description={description} />
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </article>
  )
}

export const PrivacyPage = () => (
  <Page title="Privacy" description="How FileSqueeze handles your files and data.">
    <p>Tools marked available process your files inside your browser using the File API, Web Workers and WebAssembly. Those files are not sent to our servers, and we do not store them.</p>
    <p>This site is a static website hosted on Firebase Hosting. Hosting providers may keep standard access logs (such as IP address and requested URL). We do not run analytics or advertising scripts, and we do not require an account.</p>
    <p>No system is perfectly secure. Closing the tab releases the memory used for processing; files you download are saved by your browser to your device.</p>
  </Page>
)
export const TermsPage = () => (
  <Page title="Terms" description="Terms of use for FileSqueeze.">
    <p>The service is provided free and “as is”, without warranty. Keep a backup of important files: always check output files before replacing originals.</p>
    <p>You are responsible for having the right to process the files you select.</p>
  </Page>
)
export const AboutPage = () => (
  <Page title="About" description="About FileSqueeze.">
    <p>FileSqueeze is a free, privacy-first set of file utilities that run in the browser. Tools appear as available only once they work end to end; the rest are labelled coming soon.</p>
  </Page>
)
export const ContactPage = () => (
  <Page title="Contact" description="Contact FileSqueeze.">
    <p>Contact details will be published here before launch.</p>
  </Page>
)
