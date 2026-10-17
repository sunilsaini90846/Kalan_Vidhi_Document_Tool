// Regenerates docs/FORMATS.md from the format registry. Usage: npm run docs:formats
import { buildSync } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'formats-'))
const outfile = join(dir, 'markdown.mjs')
buildSync({ entryPoints: ['src/services/formats/markdown.ts'], bundle: true, format: 'esm', outfile, platform: 'node', alias: { '@': './src' }, logLevel: 'error' })
const { formatsMarkdown } = await import(pathToFileURL(outfile).href)
writeFileSync('docs/FORMATS.md', formatsMarkdown() + '\n')
console.log('docs/FORMATS.md written')
