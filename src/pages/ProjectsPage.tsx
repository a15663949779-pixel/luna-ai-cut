import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Camera, Film, RefreshCw, Search, Smartphone } from 'lucide-react'

import { DirectorLabView } from '../components/DirectorLabView'
import { DirectorPlanDeleteControl } from '../components/DirectorPlanDeleteControl'
import { isDirectorShootingPlan } from '../lib/directorPlanSync'
import type { DirectorLanPlanSummary } from '../shared/types'
import { Button } from '../ui'
import { LunaEditWorkspace } from './LunaEditWorkspace'
import './ProjectsPage.css'

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

function AiProjectHome({
  active,
  loading,
  error,
  plans,
  onRefresh,
  onCreateShooting,
  onPairPhone,
  onOpen,
  onDeleted,
}: {
  active: boolean
  loading: boolean
  error: string
  plans: DirectorLanPlanSummary[]
  onRefresh(): void
  onCreateShooting(): void
  onPairPhone(): void
  onOpen(plan: DirectorLanPlanSummary): void
  onDeleted(plan: DirectorLanPlanSummary): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const visiblePlans = plans.filter(plan => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return !normalizedQuery || `${plan.title} ${plan.main_content ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
  })

  return <section className="ai-project-home" aria-busy={active && loading}>
    <div className="ai-project-home-inner">
      <header className="ai-project-home-header">
        <div className="ai-project-heading">
          <h1>AI导拍</h1>
          <span>{loading ? '读取中' : `${plans.length} 个计划`}</span>
        </div>
        <div className="ai-project-home-actions">
          <Button size="compact" variant="secondary" icon={<Smartphone size={14} />} onClick={onPairPhone}>
            配对手机
          </Button>
          <Button size="compact" variant="secondary" icon={<Camera size={14} />} onClick={onCreateShooting}>
            新建拍摄计划
          </Button>
        </div>
      </header>

      <div className="ai-project-list-tools">
        <label className="ai-project-search">
          <Search size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索计划" aria-label="搜索计划" />
        </label>
        <Button size="compact" variant="secondary" icon={<RefreshCw size={14} />} disabled={loading} onClick={onRefresh}>
          刷新
        </Button>
      </div>

      <div className="ai-project-list" aria-live="polite">
        {visiblePlans.map(plan => <div className="ai-project-row-shell" key={plan.id}>
          <button className="ai-project-row" type="button" onClick={() => onOpen(plan)}>
            <span className="ai-project-icon shooting"><Film size={18} /></span>
            <span className="ai-project-row-title">
              <strong>{plan.title}</strong>
              <small>拍摄计划 · {plan.shot_count} 个镜头 · {plan.take_count} 段素材</small>
            </span>
            <span className="ai-project-row-progress">
              <strong>{plan.completed_shot_count}/{plan.shot_count} 镜头完成</strong>
              <small>更新于 {dateLabel(plan.local_updated_at ?? plan.updated_at)}</small>
            </span>
            <ArrowRight size={17} className="ai-project-row-arrow" />
          </button>
          <DirectorPlanDeleteControl
            plan={plan}
            disabled={loading}
            onDeleted={onDeleted}
          />
        </div>)}
        {!loading && visiblePlans.length === 0 && <div className="ai-project-empty">
          <strong>{error || (query ? '没有匹配的计划' : '暂无拍摄计划')}</strong>
          {error && <button type="button" onClick={onRefresh}>重新加载</button>}
          {!error && !query && <div className="ai-project-empty-actions">
            <button type="button" onClick={onCreateShooting}>新建拍摄计划</button>
          </div>}
        </div>}
      </div>
    </div>
  </section>
}

export function ProjectsPage({ active }: { active: boolean }): JSX.Element {
  const [view, setView] = useState<'home' | 'shooting'>('home')
  const [plans, setPlans] = useState<DirectorLanPlanSummary[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [editingSyncRevision, setEditingSyncRevision] = useState(0)
  const [createPlanKey, setCreatePlanKey] = useState(0)
  const [pairingOpen, setPairingOpen] = useState(false)

  const shootingPlans = useMemo(() => plans
    .filter(isDirectorShootingPlan)
    .sort((left, right) => Date.parse(right.local_updated_at ?? right.updated_at)
      - Date.parse(left.local_updated_at ?? left.updated_at)), [plans])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const localPlans = await window.luna.directorLab.listLocalPlans()
      setPlans(localPlans)
    } catch {
      setError('拍摄计划读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDirectorPlansChange = useCallback((nextPlans: DirectorLanPlanSummary[]) => {
    // This callback contains the complete current list. Keeping missing remote
    // rows here resurrects plans deleted on the phone.
    setPlans(nextPlans)
  }, [])

  const handleConnectedEndpointChange = useCallback((endpoint: string | null) => {
    if (!endpoint) return
    setRefreshRevision(value => value + 1)
    setEditingSyncRevision(value => value + 1)
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const refreshOnFocus = () => {
      setRefreshRevision(value => value + 1)
      setEditingSyncRevision(value => value + 1)
      void refresh()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [active, refresh])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setEditingSyncRevision(value => value + 1), 12_000)
    return () => window.clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (view !== 'shooting' || !selectedPlanId) return
    if (shootingPlans.some(plan => plan.id === selectedPlanId)) return
    setSelectedPlanId(null)
    setView('home')
  }, [selectedPlanId, shootingPlans, view])

  const selectedShootingPlanId = shootingPlans.some(plan => plan.id === selectedPlanId) ? selectedPlanId : null

  return <main className={`ai-editor-page${view === 'home' ? ' is-project-home' : ''}`}>
    <div className="ai-editor-main">
      {view === 'home' && <AiProjectHome
        active={active}
        loading={loading}
        error={error}
        plans={shootingPlans}
        onRefresh={() => {
          setRefreshRevision(value => value + 1)
          setEditingSyncRevision(value => value + 1)
          void refresh()
        }}
        onCreateShooting={() => {
          setCreatePlanKey(value => value + 1)
        }}
        onPairPhone={() => setPairingOpen(true)}
        onOpen={plan => {
          setSelectedPlanId(plan.id)
          setView('shooting')
        }}
        onDeleted={deleted => {
          const remotePlan = deleted.remote_plan
          setPlans(current => current.flatMap(plan => plan.id !== deleted.id
            ? [plan]
            : remotePlan ? [remotePlan] : []))
        }}
      />}
      <div className="ai-project-shooting-host" hidden={view !== 'shooting'}>
        <DirectorLabView
          active={active}
          selectedPlanId={selectedShootingPlanId}
          onPlansChange={handleDirectorPlansChange}
          onSelectPlan={planId => setSelectedPlanId(planId)}
          onReturnToProjects={() => {
            setView('home')
            setSelectedPlanId(null)
            setRefreshRevision(value => value + 1)
          }}
          onConnectedEndpointChange={handleConnectedEndpointChange}
          pairingOpen={pairingOpen}
          onPairingOpenChange={setPairingOpen}
          refreshKey={refreshRevision}
          createPlanKey={createPlanKey}
        />
      </div>
      <div className="ai-project-editor-sync-host" hidden>
        <LunaEditWorkspace
          active={active}
          projectId={null}
          onProjectIdChange={() => undefined}
          projectIndexOnly
          refreshKey={editingSyncRevision}
        />
      </div>
    </div>
  </main>
}
