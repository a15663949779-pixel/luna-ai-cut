import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Scissors, Search } from 'lucide-react'

import { useAgentChat } from '../components/agent-chat/agentChatContext'
import { Button, toast } from '../ui'
import type { EditProjectSummary } from '../shared/types'
import { LunaEditWorkspace } from './LunaEditWorkspace'
import './AiEditorPage.css'

interface AiEditorLocationState {
  projectId?: string | null
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

function AiEditProjectHome({
  active,
  creating,
  onOpen,
  onCreate,
}: {
  active: boolean
  creating: boolean
  onOpen(projectId: string): void
  onCreate(): Promise<void>
}): JSX.Element {
  const [projects, setProjects] = useState<EditProjectSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setProjects(await window.luna.aiEditor.project.list())
    } catch (value) {
      setError(value instanceof Error ? value.message : '剪辑工程列表读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const refreshOnFocus = () => { void refresh() }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [active, refresh])

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return projects.filter(project => !normalizedQuery || project.projectName.toLocaleLowerCase().includes(normalizedQuery))
  }, [projects, query])

  return <section className="ai-project-home">
    <div className="ai-project-home-inner">
      <header className="ai-project-home-header">
        <div className="ai-project-heading">
          <h1>剪辑工程</h1>
          <span>{loading ? '读取中' : `${visibleProjects.length} 个工程`}</span>
        </div>
        <div className="ai-project-home-actions">
          <Button size="compact" variant="secondary" icon={<RefreshCw size={14} />} disabled={loading} onClick={() => void refresh()}>
            刷新
          </Button>
          <Button size="compact" variant="primary" icon={<Plus size={15} />} disabled={creating} onClick={() => void onCreate()}>
            {creating ? '创建中…' : '新建工程'}
          </Button>
        </div>
      </header>

      <div className="ai-project-list-tools">
        <label className="ai-project-search">
          <Search size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索剪辑工程" aria-label="搜索剪辑工程" />
        </label>
      </div>

      <div className="ai-project-list" aria-live="polite">
        {visibleProjects.map(project => <button
          className="ai-project-row"
          type="button"
          key={project.projectId}
          onClick={() => onOpen(project.projectId)}
        >
          <span className="ai-project-icon"><Scissors size={18} /></span>
          <span className="ai-project-row-title">
            <strong>{project.projectName}</strong>
            <small>更新于 {dateLabel(project.updatedAt)}</small>
          </span>
          <span className="ai-project-row-progress">
            <strong>{project.clipCount} 段剪辑</strong>
            <small>版本 {project.revision}</small>
          </span>
          <ArrowRight size={17} className="ai-project-row-arrow" />
        </button>)}
        {!loading && visibleProjects.length === 0 && <div className="ai-project-empty">
          <strong>{error || (query ? '没有匹配的工程' : '暂无剪辑工程')}</strong>
          {error && <button type="button" onClick={() => void refresh()}>重新加载</button>}
          {!error && !query && <button type="button" disabled={creating} onClick={() => void onCreate()}>
            {creating ? '创建中…' : '新建剪辑工程'}
          </button>}
        </div>}
      </div>
    </div>
  </section>
}

export function AiEditorPage({ active }: { active: boolean }): JSX.Element {
  const location = useLocation()
  const { setPageContext } = useAgentChat()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [showProjectList, setShowProjectList] = useState(true)
  const [creating, setCreating] = useState(false)
  const state = location.state as AiEditorLocationState | null

  useEffect(() => {
    if (!active || !state || !('projectId' in state)) return
    const targetProjectId = state?.projectId ?? null
    setProjectId(targetProjectId)
    setShowProjectList(!targetProjectId)
  }, [active, location.key, state])

  useEffect(() => {
    if (active && projectId) setPageContext({ projectId })
    else setPageContext({})
    return () => setPageContext({})
  }, [active, projectId, setPageContext])

  async function createProject(): Promise<void> {
    if (creating) return
    setCreating(true)
    try {
      const created = await window.luna.aiEditor.project.create('AI 剪辑')
      setProjectId(created.projectId)
      setShowProjectList(false)
    } catch (value) {
      toast.error(value instanceof Error ? value.message : '剪辑工程创建失败')
    } finally {
      setCreating(false)
    }
  }

  function backToProjects(): void {
    setProjectId(null)
    setShowProjectList(true)
  }

  return <main className={`ai-editor-page${showProjectList ? ' is-project-home' : ''}`}>
    {!showProjectList && <nav className="ai-editor-subnav" aria-label="AI 剪辑">
      <button className="ai-editor-back" type="button" onClick={backToProjects}>
        <ArrowLeft size={16} />
        <span>剪辑工程</span>
      </button>
    </nav>}
    <div className="ai-editor-main">
      {showProjectList
        ? <AiEditProjectHome active={active} creating={creating} onOpen={id => {
          setProjectId(id)
          setShowProjectList(false)
        }} onCreate={createProject} />
        : <LunaEditWorkspace active={active} projectId={projectId} onProjectIdChange={setProjectId} />}
    </div>
  </main>
}
