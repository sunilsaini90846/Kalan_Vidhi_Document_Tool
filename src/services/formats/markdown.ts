import { FORMATS, type FormatEntry, type SupportLevel } from './registry'

const LEVEL: Record<SupportLevel, string> = {
  supported: 'Supported now',
  'after-implementation': 'Supported after implementation',
  'specialized-engine': 'Requires a specialized engine',
  'not-in-browser': 'Not supported in the browser-only architecture',
  'not-planned': 'Not planned',
}
const yn = (b: boolean) => (b ? 'yes' : '–')
const GROUP: Record<FormatEntry['group'], string> = { image: 'Images', document: 'Documents', archive: 'Archives', media: 'Audio / video' }

/** The format support matrix as Markdown; generated from the registry so it cannot drift from the code. */
export function formatsMarkdown(): string {
  const out = [
    '# Format support matrix',
    '',
    '<!-- Generated from src/services/formats/registry.ts by `npm run docs:formats`. Do not edit by hand. -->',
    '',
    'Support is **per tool and per operation**. A format recognized by content is not necessarily readable, and a readable format is not necessarily compressible. Columns:',
    '',
    '- **Recognized**: identified by file signature (never by extension or MIME type alone).',
    '- **Decodable**: the app can read it (some depend on the browser; checked at runtime).',
    '- **Compress**: produces a smaller file in the *same* format.',
    '- **Convert to**: output formats it can be converted to.',
    '- **Merge / Extract**: can be combined into a PDF or merged / has contents that can be pulled out.',
    '- **Tools**: the only tools that accept it.',
    '',
  ]
  for (const group of ['image', 'document', 'archive', 'media'] as const) {
    out.push(`## ${GROUP[group]}`, '', '| Format | Status | Recognized | Decodable | Compress | Convert to | Merge | Extract | Tools | Engine, limits and licensing |', '|---|---|---|---|---|---|---|---|---|---|')
    for (const f of FORMATS.filter((x) => x.group === group)) {
      out.push(`| ${f.label} | ${LEVEL[f.level]} | ${yn(f.recognized)} | ${yn(f.decodable)} | ${yn(f.compressible)} | ${f.convertibleTo.join(', ') || '–'} | ${yn(f.mergeable)} | ${yn(f.extractable)} | ${f.tools.join(', ') || '–'} | ${f.note.replace(/\|/g, '\\|')} |`)
    }
    out.push('')
  }
  return out.join('\n')
}
