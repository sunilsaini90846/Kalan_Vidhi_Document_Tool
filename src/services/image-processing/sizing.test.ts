import { outputName, savedPercent, targetSize } from './sizing'

describe('targetSize', () => {
  it('keeps aspect ratio inside the box', () => expect(targetSize(4000, 2000, { maxWidth: 1000 })).toEqual({ width: 1000, height: 500 }))
  it('uses the tighter constraint', () => expect(targetSize(1000, 1000, { maxWidth: 500, maxHeight: 250 })).toEqual({ width: 250, height: 250 }))
  it('does not enlarge by default', () => expect(targetSize(100, 50, { maxWidth: 1000 })).toEqual({ width: 100, height: 50 }))
  it('enlarges when allowed', () => expect(targetSize(100, 50, { maxWidth: 200 }, true)).toEqual({ width: 200, height: 100 }))
  it('is unchanged without a box', () => expect(targetSize(321, 123, {})).toEqual({ width: 321, height: 123 }))
})
describe('helpers', () => {
  it('savedPercent can be negative', () => expect(savedPercent(100, 150)).toBe(-50))
  it('outputName swaps extension', () => expect(outputName('a.b.png', '-x', 'image/webp')).toBe('a.b-x.webp'))
})
