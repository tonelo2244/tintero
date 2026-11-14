import { useCallback, useEffect, useState } from 'react'
import type { RecentFile } from '@shared/ipc'
import { platform } from '@/core/platform'

export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>([])

  useEffect(() => {
    let cancelled = false
    void platform.recents.list().then((items) => {
      if (!cancelled) setRecents(items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setPinned = useCallback(async (path: string, pinned: boolean) => {
    setRecents(await platform.recents.setPinned(path, pinned))
  }, [])

  const remove = useCallback(async (path: string) => {
    setRecents(await platform.recents.remove(path))
  }, [])

  return { recents, setPinned, remove }
}
