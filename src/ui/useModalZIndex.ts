import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { indexOf, subscribe, acquireIndex, releaseIndex } from './zIndexManager'

/** 按当前打开顺序订阅弹窗栈层级。 */
export function useModalZIndex(open: boolean): number {
  const [id, setId] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setId(null)
      return
    }

    const nextId = acquireIndex()
    setId(nextId)
    return () => releaseIndex(nextId)
  }, [open])

  return useSyncExternalStore(subscribe, () => indexOf(id) ?? 0, () => 0)
}
