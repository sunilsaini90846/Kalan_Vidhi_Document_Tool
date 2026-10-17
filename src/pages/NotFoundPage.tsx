import { Link } from 'react-router-dom'
import { Seo } from '@/components/common/Seo'

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Seo title="Page not found" description="The page you requested does not exist." noindex />
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-brand-700 underline">Back to home</Link>
    </div>
  )
}
