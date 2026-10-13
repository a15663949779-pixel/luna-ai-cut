import { useEffect, useRef, useState } from 'react'
import type { DirectorPlanConflict } from '../hooks/useDirectorPlanSync'
import { Button, Dialog, toast } from '../ui'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: DirectorPlanConflict[]
  resolvingPlanId: string | null
  onResolve: (planId: string, source: 'remote' | 'local', reviewed: DirectorPlanConflict) => Promise<void>
}

export function DirectorPlanConflictDialog({ open, onOpenChange, conflicts, resolvingPlanId, onResolve }: Props) {
  const [error, setError] = useState('')
  const openRef = useRef(open)
  const conflict = conflicts[0] ?? null

  useEffect(() => {
    openRef.current = open
    return () => { openRef.current = false }
  }, [open])

  async function resolve(source: 'remote' | 'local'): Promise<void> {
    if (!conflict || resolvingPlanId) return
    setError('')
    openRef.current = false
    onOpenChange(false)
    try {
      await onResolve(conflict.remote.id, source, conflict)
    } catch (value) {
      const message = value instanceof Error ? value.message : '同步处理失败，请重试'
      if (openRef.current) setError(message)
      else toast.error(message)
    }
  }

  return <Dialog
    open={open && conflict !== null}
    onOpenChange={next => {
      openRef.current = next
      if (next) setError('')
      onOpenChange(next)
    }}
    title="计划同步冲突"
    description={conflict
      ? `“${conflict.remote.title}”两端内容不同，所选版本会覆盖另一端。`
      : '选择要保留的版本。'}
    closeOnMaskClick
    showCloseButton
    footer={<>
      <Button variant="secondary" disabled={resolvingPlanId !== null} onClick={() => void resolve('remote')}>
        以手机为准
      </Button>
      <Button variant="primary" disabled={resolvingPlanId !== null} onClick={() => void resolve('local')}>
        以电脑为准
      </Button>
    </>}
  >
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
