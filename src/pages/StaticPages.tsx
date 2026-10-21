import type { ReactNode } from 'react'
import { Seo } from '@/components/common/Seo'
import { BRAND } from '@/config/brand'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <Seo />
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </article>
  )
}

export const PrivacyPage = () => (
  <Page title="Privacy">
    <p>Tools marked available process your files inside your browser using the File API, Web Workers and WebAssembly. Those files are not sent to our servers, and we do not store them.</p>
    <p>This site is a static website hosted on Firebase Hosting. Hosting providers may keep standard access logs (such as IP address and requested URL). We do not run analytics or advertising scripts, and we do not require an account.</p>
    <p>No system is perfectly secure. Closing the tab releases the memory used for processing; files you download are saved by your browser to your device.</p>
  </Page>
)
export const TermsPage = () => (
  <Page title="Terms">
    <p>The service is provided free and “as is”, without warranty. Keep a backup of important files: always check output files before replacing originals.</p>
    <p>You are responsible for having the right to process the files you select.</p>
  </Page>
)
export const AboutPage = () => (
  <Page title="About">
    <p>{BRAND.name} is a free, privacy-first set of file utilities from {BRAND.parent} that run in your browser. A tool is listed as available only once it works end to end and has been tested.</p>
    <p>{BRAND.parent} is the business behind this tool. Visit <a className="font-medium text-brand-700 underline" href={BRAND.parentUrl}>kalanvidhi.com</a> to learn more about {BRAND.parent} and its other products.</p>
    <p>It has no accounts and no backend. Files are processed on your device by the tools marked available, and each tool page states what it can and cannot do, including formats it does not support.</p>
  </Page>
)
/** Routed only when BRAND.contactEmail is set. */
export const ContactPage = () => (
  <Page title="Contact">
    <p>Questions, bug reports or a file that did not process as expected: email <a className="font-medium text-brand-700 underline" href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.</p>
    <p>Please do not attach private files. The tools never upload your files, and we would rather not receive them by email either; a description of the file type, size and the message you saw is enough.</p>
  </Page>
)
