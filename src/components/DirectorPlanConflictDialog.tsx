import { useState } from 'react'
import type { DirectorPlanConflict } from '../hooks/useDirectorPlanSync'
import { Button, Dialog } from '../ui'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: DirectorPlanConflict[]
  resolvingPlanId: string | null
  onResolve: (planId: string, source: 'remote' | 'local', reviewed: DirectorPlanConflict) => Promise<void>
}

export function DirectorPlanConflictDialog({ open, onOpenChange, conflicts, resolvingPlanId, onResolve }: Props) {
  const [error, setError] = useState('')
  const conflict = conflicts[0] ?? null

  async function resolve(source: 'remote' | 'local'): Promise<void> {
    if (!conflict) return
    setError('')
    try {
      await onResolve(conflict.remote.id, source, conflict)
    } catch (value) {
      setError(value instanceof Error ? value.message : '同步处理失败，请重试')
    }
  }

  return <Dialog
    open={open && conflict !== null}
    onOpenChange={next => {
      if (resolvingPlanId) return
      onOpenChange(next)
    }}
    title="计划同步冲突"
    description={conflict
      ? `“${conflict.remote.title}”两端内容不同，所选版本会覆盖另一端。`
      : '选择要保留的版本。'}
    closeOnMaskClick={false}
    showCloseButton={false}
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
