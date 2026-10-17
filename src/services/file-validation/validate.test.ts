import { validateBatch, validateFile } from './validate'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const mk = (bytes: number[], name: string) => new File([new Uint8Array(bytes)], name, { lastModified: 1 })
const rules = { accept: ['png', 'jpeg'] as const }

describe('validateFile', () => {
  it('accepts a PNG by signature', async () => {
    await expect(validateFile(mk(PNG, 'a.png'), rules)).resolves.toMatchObject({ kind: 'png' })
  })
  it('rejects empty files', async () => {
    await expect(validateFile(new File([], 'e.png'), rules)).rejects.toMatchObject({ code: 'EMPTY_FILE' })
  })
  it('rejects a renamed non-image', async () => {
    await expect(validateFile(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'fake.png'), rules)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
  })
  it('rejects oversized files', async () => {
    await expect(validateFile(mk(PNG, 'big.png'), { ...rules, maxFileBytes: 4 })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })
})

describe('validateBatch', () => {
  it('flags duplicates of the existing selection', async () => {
    const f = mk(PNG, 'a.png')
    const r = await validateBatch([mk(PNG, 'a.png')], [f], rules)
    expect(r.accepted).toHaveLength(0)
    expect(r.rejected[0]?.error.code).toBe('DUPLICATE')
  })
})

describe('batch limits', () => {
  it('stops accepting files past the file-count cap', async () => {
    const many = Array.from({ length: 52 }, (_, i) => new File([new Uint8Array(PNG)], `f${i}.png`, { lastModified: i }))
    const r = await validateBatch(many, [], rules)
    expect(r.accepted).toHaveLength(50)
    expect(r.rejected.every((x) => x.error.code === 'TOO_MANY_FILES')).toBe(true)
  })
  it("accepts any content with accept: 'any' but still rejects empty files", async () => {
    await expect(validateFile(mk([1, 2, 3], 'notes.txt'), { accept: 'any' })).resolves.toMatchObject({ kind: 'unknown' })
    await expect(validateFile(new File([], 'e.txt'), { accept: 'any' })).rejects.toMatchObject({ code: 'EMPTY_FILE' })
  })
})
