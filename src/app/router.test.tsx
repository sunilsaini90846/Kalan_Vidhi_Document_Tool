import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from './router'
import { TOOLS } from '@/tools/registry'

const at = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)

describe('routing', () => {
  it('renders the homepage', async () => {
    at('/')
    expect(await screen.findByRole('heading', { level: 1, name: /free file compression/i })).toBeInTheDocument()
  })
  it('renders 404 for unknown paths', async () => {
    at('/nope')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })
  it('lists available tools as links', async () => {
    at('/tools')
    expect(await screen.findByRole('link', { name: /zip tools/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /image compressor/i })).toBeInTheDocument()
  })
  it('every available tool has a route', () => {
    const paths = new Set(routes[0]!.children!.map((r) => r.path))
    TOOLS.filter((t) => t.status === 'available').forEach((t) => expect(paths.has(t.slug)).toBe(true))
  })
})
