import type { EditingProjectConflict } from '../hooks/useLunaEditProjectSync'
import { EditingProjectConflictDialog } from './EditingProjectConflictDialog'

interface Props {
  open: boolean
  conflicts: EditingProjectConflict[]
  resolving: boolean
  error: string
  progress: string
  statusCollapsed: boolean
  onOpenConflictDialog(): void
  onCollapseStatus(): void
  onExpandStatus(): void
  onResolve(source: 'phone' | 'computer'): void
}

export function EditingProjectSyncControls({
  open,
  conflicts,
  resolving,
  error,
  progress,
  statusCollapsed,
  onOpenConflictDialog,
  onCollapseStatus,
  onExpandStatus,
  onResolve,
}: Props) {
  return <>
    {!open && progress && statusCollapsed && <button className="ai-edit-sync-background ai-edit-sync-background-collapsed"
      type="button" onClick={onExpandStatus}>同步处理中 · 展开</button>}
    {!open && progress && !statusCollapsed && <div className="ai-edit-sync-background" role="status" aria-live="polite">
      <span>后台同步中：{progress}</span>
      <button type="button" onClick={onCollapseStatus}>收起</button>
    </div>}
    {error && conflicts.length > 0 && <div className="ai-edit-sync-background ai-edit-sync-background-error" role="alert">
      <span>{error}</span>
      <button type="button" onClick={onOpenConflictDialog}>重新选择</button>
    </div>}
    {!open && !progress && !error && conflicts.length > 0 && statusCollapsed && <button
      className="ai-edit-sync-background ai-edit-sync-background-collapsed" type="button" onClick={onExpandStatus}>
      {conflicts.length} 个工程待确认 · 展开
    </button>}
    {!open && !progress && !error && conflicts.length > 0 && !statusCollapsed && <div className="ai-edit-sync-background" role="status">
      <span>还有 {conflicts.length} 个工程需要确认</span>
      <button type="button" onClick={onOpenConflictDialog}>处理冲突</button>
      <button type="button" onClick={onCollapseStatus}>收起</button>
    </div>}
    <EditingProjectConflictDialog
      open={open}
      conflict={conflicts[0] ?? null}
      resolving={resolving}
      error={error}
      progress={progress}
      onResolve={onResolve}
    />
  </>
}
