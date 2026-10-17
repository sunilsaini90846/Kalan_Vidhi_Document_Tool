export type PagePreset = 'a4' | 'a3' | 'letter' | 'legal' | 'custom'
export type Orientation = 'portrait' | 'landscape'
export type FitMode = 'fit' | 'fill'

const PRESETS: Record<Exclude<PagePreset, 'custom'>, [number, number]> = {
  a4: [595.28, 841.89], a3: [841.89, 1190.55], letter: [612, 792], legal: [612, 1008],
}
export const MM_TO_PT = 72 / 25.4

export interface PageSettings {
  preset: PagePreset
  customMm?: { width: number; height: number }
  orientation: Orientation
  marginPt: number
  cols: number
  rows: number
  spacingPt: number
  fit: FitMode
}

export interface Rect { x: number; y: number; width: number; height: number } // top-left origin, points

export function pageSize(s: Pick<PageSettings, 'preset' | 'customMm' | 'orientation'>): [number, number] {
  const [w, h] = s.preset === 'custom'
    ? [(s.customMm?.width ?? 210) * MM_TO_PT, (s.customMm?.height ?? 297) * MM_TO_PT]
    : PRESETS[s.preset]
  const [short, long] = w <= h ? [w, h] : [h, w]
  return s.orientation === 'portrait' ? [short, long] : [long, short]
}

export const imagesPerPage = (s: Pick<PageSettings, 'cols' | 'rows'>) => s.cols * s.rows
export const pageCount = (images: number, s: Pick<PageSettings, 'cols' | 'rows'>) => Math.ceil(images / imagesPerPage(s))

export function computeCells(s: PageSettings): Rect[] {
  const [pw, ph] = pageSize(s)
  const cw = (pw - 2 * s.marginPt - (s.cols - 1) * s.spacingPt) / s.cols
  const ch = (ph - 2 * s.marginPt - (s.rows - 1) * s.spacingPt) / s.rows
  if (cw <= 0 || ch <= 0) throw new Error('Margins and spacing leave no room for images.')
  const cells: Rect[] = []
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++)
      cells.push({ x: s.marginPt + c * (cw + s.spacingPt), y: s.marginPt + r * (ch + s.spacingPt), width: cw, height: ch })
  return cells
}

/** Aspect ratio images are cropped to in "fill" mode. */
export const cellAspect = (s: PageSettings) => { const c = computeCells(s)[0]!; return c.width / c.height }

/** Place an image of the given pixel size inside a cell (centred, aspect preserved). */
export function placeImage(cell: Rect, imgW: number, imgH: number): Rect {
  const scale = Math.min(cell.width / imgW, cell.height / imgH)
  const width = imgW * scale, height = imgH * scale
  return { x: cell.x + (cell.width - width) / 2, y: cell.y + (cell.height - height) / 2, width, height }
}
