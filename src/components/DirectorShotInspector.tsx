import { useState } from 'react'
import { Clock3, Copy } from 'lucide-react'
import type { DirectorLanShot, DirectorLanTake } from '../shared/types'
import { normalizeDirectorShotFields } from '../lib/directorShotFields'
import { buildDirectorShotCopyText } from '../lib/directorShotCopy'
import { DirectorTakeList } from './DirectorTakeList'
import { DirectorMovementReferencePreview } from './director-movement-reference/DirectorMovementReferencePreview'
import { Button, Dialog, toast } from '../ui'
import './DirectorMediaPreviewDialog.css'
import './DirectorShotInspector.css'

interface Props {
  shot: DirectorLanShot
  takes: DirectorLanTake[]
  selectedId?: string
  disabled?: boolean
  showMovementReference?: boolean
  onSelect: (take: DirectorLanTake) => void
  onAddMaterials: () => void
  onDeleteMaterial?: (take: DirectorLanTake) => Promise<void>
}

export function DirectorShotInspector({ shot, takes, selectedId = '', disabled, showMovementReference = true, onSelect, onAddMaterials, onDeleteMaterial }: Props) {
  const [deleteCandidate, setDeleteCandidate] = useState<DirectorLanTake | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deleteMaterial = async () => {
    if (!deleteCandidate || !onDeleteMaterial || deleting) return
    setDeleting(true)
    try { await onDeleteMaterial(deleteCandidate); setDeleteCandidate(null) }
    catch (error) { toast.error(error instanceof Error ? error.message : '删除素材失败') }
    finally { setDeleting(false) }
  }
  const fields = normalizeDirectorShotFields(shot)
  const copyShot = async () => {
    try {
      await window.luna.copyText(buildDirectorShotCopyText(shot))
      toast.success('已复制镜头信息')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制失败')
    }
  }
  return <><aside className="lab-director-inspector" aria-label="镜头信息">
    <div className="lab-viewer-shot-heading">
      <span>镜头 {shot.order}</span>
      <div className="lab-viewer-shot-title-row">
        <h3>{shot.name}</h3>
        <Button variant="ghost" size="mini" icon={<Copy size={13} />} onClick={() => void copyShot()}>复制镜头</Button>
      </div>
    </div>
    <div className="lab-viewer-shot-duration"><Clock3 size={14} /><span>建议时长 {shot.duration_ms / 1000} 秒</span></div>
    {fields.attributes.map(field => <section className="lab-viewer-shot-section" key={field.id}>
      <span>{field.name}</span><p>{field.description}</p>
    </section>)}
    {fields.remark && <section className="lab-viewer-shot-section"><span>备注</span><p>{fields.remark}</p></section>}
    {showMovementReference && shot.movement_reference && <section className="lab-viewer-shot-section">
      <span>镜头构图</span>
      <DirectorMovementReferencePreview reference={shot.movement_reference} showHint />
    </section>}
    <DirectorTakeList takes={takes} selectedId={selectedId} disabled={disabled || deleting} onSelect={onSelect} onAddMaterials={onAddMaterials}
      onDelete={onDeleteMaterial ? setDeleteCandidate : undefined} />
  </aside>
    <Dialog open={Boolean(deleteCandidate)} title="删除本地素材？" tone="dark" onOpenChange={open => !open && !deleting && setDeleteCandidate(null)}
      description="确认后将删除本地素材文件，无法还原。手机端原素材不受影响。" showCloseButton={!deleting}
      footer={<><Button disabled={deleting} onClick={() => setDeleteCandidate(null)}>取消</Button>
        <Button variant="danger" disabled={deleting} onClick={() => void deleteMaterial()}>{deleting ? '删除中' : '删除'}</Button></>} />
  </>
}
