import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Film, Plus, RefreshCw, Scissors, Search } from 'lucide-react'

import { useAgentChat } from '../components/agent-chat/agentChatContext'
import { DirectorLabView } from '../components/DirectorLabView'
import { LunaEditWorkspace } from './LunaEditWorkspace'
import { Button, toast } from '../ui'
import {
  footageTakesToDownload,
  isFootagePlan,
  roughCutClipCount,
  seedFootageClips,
  selectedFootageTakeIds,
} from '../lib/directorFootageProject'
import { overlayDirectorLocalPlan } from '../lib/directorPlanSync'
import type { DirectorLanPlanSummary, EditProjectSummary } from '../shared/types'
import './ProjectsPage.css'

type ProjectKind = 'shooting' | 'editing'
type ProjectFilter = 'all' | ProjectKind
type ProjectView = 'home' | ProjectKind

interface AiEditorLocationState {
  projectId?: string | null
}

interface ProjectIndexItem {
  id: string
  kind: ProjectKind
  name: string
  updatedAt: string
  detail: string
  progress: string
  linkedPlanId?: string | null
  editProjectId?: string
  directorPlan?: DirectorLanPlanSummary
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

function mergeLocalPlans(current: DirectorLanPlanSummary[], local: DirectorLanPlanSummary[]): DirectorLanPlanSummary[] {
  const localIds = new Set(local.map(plan => plan.id))
  const currentById = new Map(current.map(plan => [plan.id, plan]))
  const mergedLocal = local.map(plan => {
    const currentPlan = currentById.get(plan.id)
    const remote = currentPlan?.source === 'remote' ? currentPlan : currentPlan?.remote_plan
    return remote ? overlayDirectorLocalPlan(remote, plan) : plan
  })
  return [...mergedLocal, ...current.filter(plan => plan.source === 'remote' && !localIds.has(plan.id))]
}

function AiProjectHome({
  active,
  loading,
  error,
  items,
  openingPlanId,
  onRefresh,
  onCreateShooting,
  onCreateEditing,
  onOpen,
}: {
  active: boolean
  loading: boolean
  error: string
  items: ProjectIndexItem[]
  openingPlanId: string | null
  onRefresh(): void
  onCreateShooting(): void
  onCreateEditing(): Promise<void>
  onOpen(item: ProjectIndexItem): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [creatingEditing, setCreatingEditing] = useState(false)
  const filters: Array<{ id: ProjectFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'shooting', label: '拍摄计划' },
    { id: 'editing', label: 'AI 剪辑' },
  ]
  const visibleItems = items.filter(item => {
    const matchesFilter = filter === 'all' || item.kind === filter
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return matchesFilter && (!normalizedQuery || `${item.name} ${item.detail}`.toLocaleLowerCase().includes(normalizedQuery))
  })

  async function createEditing(): Promise<void> {
    if (creatingEditing) return
    setCreatingEditing(true)
    try {
      await onCreateEditing()
    } finally {
      setCreatingEditing(false)
    }
  }

  return <section className="ai-project-home" aria-busy={active && loading}>
    <div className="ai-project-home-inner">
      <header className="ai-project-home-header">
        <div className="ai-project-heading">
          <h1>项目</h1>
          <span>{loading ? '读取中' : `${items.length} 个项目`}</span>
        </div>
        <div className="ai-project-home-actions">
          <Button size="compact" variant="secondary" icon={<Camera size={14} />} onClick={onCreateShooting}>
            新建拍摄计划
          </Button>
          <Button size="compact" variant="primary" icon={<Plus size={15} />} disabled={creatingEditing} onClick={() => void createEditing()}>
            {creatingEditing ? '创建中…' : '新建剪辑工程'}
          </Button>
        </div>
      </header>

      <div className="ai-project-list-tools">
        <div className="ai-project-filters" role="group" aria-label="项目类型">
          {filters.map(item => <button
            type="button"
            aria-pressed={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setFilter(item.id)}
          >{item.label}</button>)}
        </div>
        <label className="ai-project-search">
          <Search size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目" aria-label="搜索项目" />
        </label>
        <Button size="compact" variant="secondary" icon={<RefreshCw size={14} />} disabled={loading} onClick={onRefresh}>
          刷新
        </Button>
      </div>

      <div className="ai-project-list" aria-live="polite">
        {visibleItems.map(item => {
          const linked = item.kind === 'editing' && item.linkedPlanId
            ? items.find(candidate => candidate.kind === 'shooting' && candidate.id === item.linkedPlanId)
            : undefined
          const opening = item.directorPlan?.id === openingPlanId
          return <button className="ai-project-row" type="button" key={`${item.kind}:${item.id}`} disabled={opening} onClick={() => onOpen(item)}>
            <span className={`ai-project-icon ${item.kind}`}>
              {item.kind === 'shooting' ? <Film size={18} /> : <Scissors size={18} />}
            </span>
            <span className="ai-project-row-title">
              <strong>{item.name}</strong>
              <small>{opening ? '正在准备剪辑素材…' : `${item.detail}${linked ? ` · 来自 ${linked.name}` : ''}`}</small>
            </span>
            <span className="ai-project-row-progress">
              <strong>{item.progress}</strong>
              <small>更新于 {dateLabel(item.updatedAt)}</small>
            </span>
            <ArrowRight size={17} className="ai-project-row-arrow" />
          </button>
        })}
        {!loading && visibleItems.length === 0 && <div className="ai-project-empty">
          <strong>{error || (query || filter !== 'all' ? '没有匹配的项目' : '暂无项目')}</strong>
          {error && <button type="button" onClick={onRefresh}>重新加载</button>}
          {!error && !query && filter === 'all' && <div className="ai-project-empty-actions">
            <button type="button" onClick={onCreateShooting}>新建拍摄计划</button>
            <button type="button" disabled={creatingEditing} onClick={() => void createEditing()}>
              {creatingEditing ? '创建中…' : '新建剪辑工程'}
            </button>
          </div>}
        </div>}
      </div>
    </div>
  </section>
}

export function ProjectsPage({ active }: { active: boolean }): JSX.Element {
  const location = useLocation()
  const { setPageContext } = useAgentChat()
  const [view, setView] = useState<ProjectView>('home')
  const [plans, setPlans] = useState<DirectorLanPlanSummary[]>([])
  const [editProjects, setEditProjects] = useState<EditProjectSummary[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null)
  const state = location.state as AiEditorLocationState | null

  const handleConnectedEndpointChange = useCallback((endpoint: string | null) => {
    if (endpoint) setRefreshRevision(value => value + 1)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    const [localPlans, localProjects] = await Promise.allSettled([
      window.luna.directorLab.listLocalPlans(),
      window.luna.aiEditor.project.list(),
    ])
    const failures: string[] = []
    if (localPlans.status === 'fulfilled') {
      setPlans(current => mergeLocalPlans(current, localPlans.value))
    } else {
      failures.push('拍摄计划读取失败')
    }
    if (localProjects.status === 'fulfilled') setEditProjects(localProjects.value)
    else failures.push('剪辑工程读取失败')
    setError(failures.join('，'))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const refreshOnFocus = () => setRefreshRevision(value => value + 1)
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [active, refresh, refreshRevision])

  useEffect(() => {
    if (!active) return
    if (state && 'projectId' in state && state.projectId) {
      setProjectId(state.projectId)
      setView('editing')
    } else {
      setSelectedPlanId(null)
      setProjectId(null)
      setView('home')
    }
  }, [active, location.key, state])

  useEffect(() => {
    if (active && view === 'editing' && projectId) setPageContext({ projectId })
    else if (view === 'home') setPageContext({})
    return () => setPageContext({})
  }, [active, projectId, setPageContext, view])

  const items = useMemo<ProjectIndexItem[]>(() => {
    const directorPlanIds = new Set(plans.map(plan => plan.id))
    const planItems = plans.map(plan => {
      const editProject = isFootagePlan(plan)
        ? editProjects.find(project => project.directorPlanId === plan.id)
        : undefined
      if (isFootagePlan(plan)) {
        const clipCount = editProject?.clipCount ?? roughCutClipCount(plan)
        return {
          id: editProject?.projectId ?? plan.id,
          kind: 'editing' as const,
          name: plan.title,
          updatedAt: plan.local_updated_at ?? editProject?.updatedAt ?? plan.updated_at,
          detail: `AI 剪辑 · ${clipCount} 段片段 · ${editProject?.sourceCount ?? plan.take_count} 个素材`,
          progress: editProject ? `版本 ${editProject.revision}` : `${clipCount} 段粗剪片段`,
          linkedPlanId: plan.id,
          editProjectId: editProject?.projectId,
          directorPlan: plan,
        }
      }
      return {
        id: plan.id,
        kind: 'shooting' as const,
        name: plan.title,
        updatedAt: plan.local_updated_at ?? plan.updated_at,
        detail: `拍摄计划 · ${plan.shot_count} 个镜头 · ${plan.take_count} 段素材`,
        progress: `${plan.completed_shot_count}/${plan.shot_count} 镜头完成`,
      }
    })
    const standaloneEditProjects = editProjects
      .filter(project => !project.directorPlanId || !directorPlanIds.has(project.directorPlanId))
      .map(project => ({
        id: project.projectId,
        kind: 'editing' as const,
        name: project.projectName,
        updatedAt: project.updatedAt,
        detail: `AI 剪辑 · ${project.clipCount} 段片段 · ${project.sourceCount ?? 0} 个素材`,
        progress: `版本 ${project.revision}`,
        linkedPlanId: project.directorPlanId,
        editProjectId: project.projectId,
      }))
    return [...planItems, ...standaloneEditProjects]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  }, [editProjects, plans])

  function openProject(item: ProjectIndexItem): void {
    if (item.kind === 'shooting') {
      setSelectedPlanId(item.id)
      setView('shooting')
    } else if (item.directorPlan && !item.editProjectId) {
      void createEditingFromPlan(item.directorPlan)
    } else {
      setProjectId(item.editProjectId ?? item.id)
      setView('editing')
    }
  }

  async function createEditingProject(name = 'AI 剪辑'): Promise<void> {
    try {
      const created = await window.luna.aiEditor.project.create(name)
      setProjectId(created.projectId)
      setView('editing')
      void refresh()
    } catch (value) {
      toast.error(value instanceof Error ? value.message : '剪辑工程创建失败')
    }
  }

  async function createEditingFromPlan(plan: DirectorLanPlanSummary): Promise<void> {
    if (openingPlanId === plan.id) return
    const existing = editProjects.find(project => project.directorPlanId === plan.id)
    if (existing) {
      setProjectId(existing.projectId)
      setView('editing')
      return
    }
    setOpeningPlanId(plan.id)
    let createdProjectId: string | null = null
    try {
      let media = await window.luna.aiEditor.listLocalMedia({ planId: plan.id, limit: 500 }).catch(value => {
        if (isFootagePlan(plan)) throw value
        return []
      })
      if (isFootagePlan(plan)) {
        const requiredTakeIds = selectedFootageTakeIds(plan)
        if (requiredTakeIds.length === 0) {
          toast.error('这个剪辑项目还没有可用片段')
          return
        }
        const localTakeIds = new Set(media.flatMap(item =>
          (item.directorContexts ?? [])
            .filter(context => context.planId === plan.id)
            .map(context => context.takeId),
        ))
        const missingTakeIds = requiredTakeIds.filter(takeId => !localTakeIds.has(takeId))
        const downloads = footageTakesToDownload(plan).filter(item => missingTakeIds.includes(item.takeId))
        if (downloads.length !== missingTakeIds.length) {
          toast.error('剪辑项目引用的素材暂不可用')
          return
        }
        for (const item of downloads) {
          await window.luna.directorLab.download({
            operationId: `footage:${plan.id}:${item.takeId}:${Date.now()}`,
            url: item.url,
            fileName: item.fileName,
            planTitle: plan.title,
            plan,
            takeId: item.takeId,
          })
        }
        if (downloads.length > 0) {
          media = await window.luna.aiEditor.listLocalMedia({ planId: plan.id, limit: 500 })
        }
        const downloadedTakeIds = new Set(media.flatMap(item =>
          (item.directorContexts ?? [])
            .filter(context => context.planId === plan.id)
            .map(context => context.takeId),
        ))
        if (requiredTakeIds.some(takeId => !downloadedTakeIds.has(takeId))) {
          toast.error('剪辑素材没有完整同步到电脑')
          return
        }
      }
      const created = await window.luna.aiEditor.project.create(`${plan.title} 剪辑`.slice(0, 120))
      createdProjectId = created.projectId
      const loaded = await window.luna.aiEditor.project.load(created.projectId)
      let linked = await window.luna.aiEditor.project.save(
        { ...loaded.project, directorPlanId: plan.id }, loaded.project.revision,
      )
      if (media.length > 0) {
        linked = await window.luna.aiEditor.project.addMedia(linked.id, media.map(item => item.mediaId))
        if (isFootagePlan(plan)) {
          const clips = seedFootageClips(plan, media, linked)
          if (clips.length === 0) {
            await window.luna.aiEditor.project.delete(created.projectId)
            createdProjectId = null
            toast.error('剪辑片段无法生成，请检查素材范围')
            return
          }
          linked = await window.luna.aiEditor.project.save(
            { ...linked, clips }, linked.revision,
          )
        }
      }
      setProjectId(linked.id)
      setView('editing')
      createdProjectId = null
      void refresh()
    } catch (value) {
      if (createdProjectId) await window.luna.aiEditor.project.delete(createdProjectId).catch(() => undefined)
      toast.error(value instanceof Error ? value.message : '从拍摄计划创建剪辑工程失败')
    } finally {
      setOpeningPlanId(null)
    }
  }

  function backToProjects(): void {
    setView('home')
    setSelectedPlanId(null)
    setProjectId(null)
    setRefreshRevision(value => value + 1)
  }

  const shootingWorkspaceActive = active && view !== 'editing'

  return <main className={`ai-editor-page${view === 'home' ? ' is-project-home' : ''}`}>
    {view !== 'home' && <nav className="ai-editor-subnav" aria-label="项目工作区">
      <button className="ai-editor-back" type="button" onClick={backToProjects}>
        <ArrowLeft size={16} />
        <span>项目</span>
      </button>
      {view === 'editing' && <span className="ai-project-subnav-type">AI 剪辑</span>}
    </nav>}
    <div className="ai-editor-main">
      {view === 'home' && <AiProjectHome
        active={active}
        loading={loading}
        error={error}
        items={items}
        openingPlanId={openingPlanId}
        onRefresh={() => setRefreshRevision(value => value + 1)}
        onCreateShooting={() => {
          setSelectedPlanId(null)
          setView('shooting')
        }}
        onCreateEditing={() => createEditingProject()}
        onOpen={openProject}
      />}
      {view !== 'editing' && <div className="ai-project-shooting-host" hidden={view !== 'shooting'}>
        <DirectorLabView
          active={shootingWorkspaceActive}
          selectedPlanId={view === 'shooting' ? selectedPlanId : null}
          onPlansChange={setPlans}
          onSelectPlan={planId => setSelectedPlanId(planId)}
          onReturnToProjects={backToProjects}
          onConnectedEndpointChange={handleConnectedEndpointChange}
          onCreateEditFromPlan={plan => void createEditingFromPlan(plan)}
        />
      </div>}
      {view === 'home' && <div className="ai-project-editor-sync-host" hidden>
        <LunaEditWorkspace
          active={active}
          projectId={null}
          onProjectIdChange={() => undefined}
          onProjectsChange={setEditProjects}
          projectIndexOnly
          refreshKey={refreshRevision}
        />
      </div>}
      {view === 'editing' && <LunaEditWorkspace active={active} projectId={projectId} onProjectIdChange={setProjectId} />}
    </div>
  </main>
}
