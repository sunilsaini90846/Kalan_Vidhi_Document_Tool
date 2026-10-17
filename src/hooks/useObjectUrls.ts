import { useCallback, useEffect, useRef } from 'react'

/** Creates object URLs and revokes them all on unmount or `revokeAll()`. */
export function useObjectUrls() {
  const urls = useRef(new Set<string>())
  const create = useCallback((b: Blob) => { const u = URL.createObjectURL(b); urls.current.add(u); return u }, [])
  const revoke = useCallback((u: string) => { URL.revokeObjectURL(u); urls.current.delete(u) }, [])
  const revokeAll = useCallback(() => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current.clear() }, [])
  useEffect(() => revokeAll, [revokeAll])
  return { create, revoke, revokeAll }
}
