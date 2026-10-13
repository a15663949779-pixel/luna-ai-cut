import type { EditingProjectConflict } from '../hooks/useLunaEditProjectSync'
import { Button, Dialog } from '../ui'

interface Props {
  open: boolean
  conflict: EditingProjectConflict | null
  resolving: boolean
  error: string
  progress: string
  onResolve(source: 'phone' | 'computer'): void
}

export function EditingProjectConflictDialog({ open, conflict, resolving, error, progress, onResolve }: Props) {
  const phoneDeleted = Boolean(conflict && conflict.remote.deleted_at !== null)
  return <Dialog
    open={open && conflict !== null}
    onOpenChange={() => undefined}
    title="工程同步冲突"
    description={phoneDeleted
      ? `手机已删除“${conflict?.local.name ?? ''}”，所选版本会覆盖另一端。`
      : `“${conflict?.local.name ?? ''}”在手机和电脑上都有修改，所选版本会覆盖另一端。`}
    closeOnMaskClick={false}
    showCloseButton={false}
    footer={<>
      <Button variant="secondary" disabled={resolving} onClick={() => onResolve('phone')}>
        {phoneDeleted ? '按手机删除' : '以手机为准'}
      </Button>
      <Button variant="primary" disabled={resolving} onClick={() => onResolve('computer')}>
        以电脑为准
      </Button>
    </>}
  >
    {progress && <p role="status" aria-live="polite">{progress}</p>}
    {error && <p role="alert">{error}</p>}
  </Dialog>
}
