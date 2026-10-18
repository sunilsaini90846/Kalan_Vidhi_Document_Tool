import { existsSync, readFileSync } from 'node:fs'
import { TOOLS } from '@/tools/registry'

const MIN_TESTS = 5
/** Literal tests, plus each `for (...)` loop that wraps tests counts as 2 (they generate several at runtime). */
const count = (src: string) => (src.match(/^\s*(?:test|it)\(/gm) ?? []).length + 2 * (src.match(/^\s*for \(.*\) \{\s*$/gm) ?? []).length

describe('every available tool has its own end-to-end spec', () => {
  const available = TOOLS.filter((t) => t.status === 'available')

  it('there is at least one available tool (guards against an empty registry)', () => expect(available.length).toBeGreaterThanOrEqual(15))

  for (const tool of available) {
    it(`${tool.slug}: e2e/tools/${tool.slug}.spec.ts exists and is substantial`, () => {
      const file = `e2e/tools/${tool.slug}.spec.ts`
      expect(existsSync(file), `missing ${file}: add a dedicated spec for ${tool.name}`).toBe(true)
      let src = readFileSync(file, 'utf8')
      // the three OOXML optimizers share one suite body
      const shared = /from '\.\/office-optimizers\.shared'/.test(src) ? readFileSync('e2e/tools/office-optimizers.shared.ts', 'utf8') : ''
      src += shared
      expect(count(src), `${file} should hold at least ${MIN_TESTS} tests`).toBeGreaterThanOrEqual(MIN_TESTS)
      expect(src, 'must open the tool\'s own route').toContain(`/${tool.slug}`.replace(/^\/(docx|pptx|xlsx)-optimizer$/, '/${kind}-optimizer'))
    })
  }

  it('no spec exists for a tool that is not in the registry (stale specs)', async () => {
    const { readdirSync } = await import('node:fs')
    const slugs = new Set(TOOLS.map((t) => t.slug))
    const stale = readdirSync('e2e/tools').filter((f) => f.endsWith('.spec.ts')).map((f) => f.replace('.spec.ts', '')).filter((s) => !slugs.has(s))
    expect(stale).toEqual([])
  })
})
