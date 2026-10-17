import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting
const headers = (src: string) => Object.fromEntries((cfg.headers.find((h: { source: string }) => h.source === src)?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]))

describe('firebase.json', () => {
  it('serves the Vite build output', () => expect(cfg.public).toBe('dist'))
  it('rewrites unknown paths to the SPA shell', () => expect(cfg.rewrites).toContainEqual({ source: '**', destination: '/index.html' }))
  it('revalidates everything by default but caches hashed assets long', () => {
    expect(headers('**')['Cache-Control']).toBe('no-cache')
    expect(headers('/assets/**')['Cache-Control']).toMatch(/max-age=31536000.*immutable/)
  })
  it('lists the assets rule after the catch-all so it takes precedence', () => {
    const order = cfg.headers.map((h: { source: string }) => h.source)
    expect(order.indexOf('/assets/**')).toBeGreaterThan(order.indexOf('**'))
  })
  it('sets a strict CSP that still allows workers and blob previews', () => {
    const csp: string = headers('**')['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("worker-src 'self' blob:")
    expect(csp).toContain("img-src 'self' blob: data:")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(csp).not.toMatch(/https?:\/\//) // no third-party origins
  })
  it('sets basic hardening headers', () => {
    const h = headers('**')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
  })
  it('keeps deployment-specific config out of git', () => {
    const ignore = readFileSync('.gitignore', 'utf8')
    expect(ignore).toMatch(/^\.firebaserc$/m)
    expect(ignore).toMatch(/^\.env$/m)
  })
})
