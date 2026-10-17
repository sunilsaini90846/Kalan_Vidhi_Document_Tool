import { renderHook } from '@testing-library/react'
import { useObjectUrls } from './useObjectUrls'

describe('useObjectUrls', () => {
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:test/${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('revokes every URL it created when unmounted', () => {
    const { result, unmount } = renderHook(() => useObjectUrls())
    result.current.create(new Blob(['a'])); result.current.create(new Blob(['b']))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
  it('does not revoke a URL twice after explicit revoke', () => {
    const { result, unmount } = renderHook(() => useObjectUrls())
    const u = result.current.create(new Blob(['a']))
    result.current.revoke(u)
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
  it('revokeAll clears everything', () => {
    const { result } = renderHook(() => useObjectUrls())
    result.current.create(new Blob(['a'])); result.current.create(new Blob(['b']))
    result.current.revokeAll()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
