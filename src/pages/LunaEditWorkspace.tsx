import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Film, Music2, Pause, Play, Plus, Save, Trash2 } from 'lucide-react'

import type { AiEditorLocalMedia } from '../shared/types/aiEditor'
import type { EditProjectClip, EditProjectSummary, EditProjectSource, LunaEditProject } from '../shared/types/aiEditing'
import { toLunaEditWireProject } from '../lib/aiEditingWire'
import { requestEditingProject, requestEditingProjects, writeEditingProject } from '../lib/editingLanProjects'
import type { PreviewLayer } from '../shared/types/render'
import { clipOutputDurationMs, clipSourceOffsetAtOutputMs, orderedTimelineClips } from '../shared/aiEditingTimeline'
import { LrcRender } from '../components/LrcRender'
import { Button, Select, toast } from '../ui'

function clipDuration(clip: EditProjectClip): number {
  return clipOutputDurationMs(clip)
}

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function orderedClips(clips: EditProjectClip[]): EditProjectClip[] {
  return orderedTimelineClips(clips)
}

type EditingSyncState = 'offline' | 'syncing' | 'synced' | 'conflict' | 'error'
type EditingSyncBaseline = { revision: number; signature: string }
const DIRECTOR_ENDPOINT_KEY = 'luna.director-lab.endpoint'
const DIRECTOR_PAIRED_KEY = 'luna.director-lab.paired'
const EDITING_SYNC_BASELINE_KEY = 'luna.ai-editing.sync-baselines'

async function hasPairingForEndpoint(endpoint: string): Promise<boolean> {
  if (localStorage.getItem(DIRECTOR_PAIRED_KEY) !== 'true') return false
  const paired = await window.luna.lunaKaHttpClient.hasPairing(endpoint).catch(() => false)
  if (!paired) localStorage.removeItem(DIRECTOR_PAIRED_KEY)
  return paired
}

function readEditingSyncBaselines(): Record<string, EditingSyncBaseline> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EDITING_SYNC_BASELINE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, EditingSyncBaseline> : {}
  } catch {
    return {}
  }
}

function editingSyncSignature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(editingSyncSignature).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${editingSyncSignature(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function previewLayers(
  project: LunaEditProject,
  filters: Array<{ id: string; path: string }>,
  watermarks: Array<{ id: string; path: string; width: number; height: number }>,
  playheadMs: number,
): PreviewLayer[] {
  const timeline = orderedClips(project.clips)
  const activeClip = timeline.find(clip => playheadMs >= clip.timelineStartMs && playheadMs < clip.timelineStartMs + clipDuration(clip)) ?? timeline[timeline.length - 1]
  const source = activeClip ? project.sources.find(item => item.id === activeClip.sourceId) : null
  const filter = project.filter?.enabled ? filters.find(item => item.id === project.filter?.id) : null
  const duration = activeClip ? clipDuration(activeClip) : 0
  const localOutputMs = activeClip ? Math.max(0, Math.min(duration, playheadMs - activeClip.timelineStartMs)) : 0
  const sourceOffset = activeClip && source?.kind === 'video' ? clipSourceOffsetAtOutputMs(activeClip, localOutputMs) : 0
  const fadeDuration = activeClip ? Math.min(activeClip.fadeOutMs ?? 0, duration / 2) : 0
  const opacity = fadeDuration > 0 && localOutputMs > duration - fadeDuration
    ? Math.max(0, (duration - localOutputMs) / fadeDuration) : 1
  const result: PreviewLayer[] = source && activeClip && source.kind !== 'audio'
    && source.available !== false && source.path ? [{
    filePath: source.path,
    isVideo: source.kind === 'video',
    videoTime: (activeClip.sourceStartMs + sourceOffset) / 1000,
    videoDuration: Math.max(0.04, duration / 1000),
    dstX: 0, dstY: 0, dstW: project.canvas.width, dstH: project.canvas.height,
    srcX: activeClip.crop?.left ?? 0, srcY: activeClip.crop?.top ?? 0,
    srcW: activeClip.crop?.width ?? 1, srcH: activeClip.crop?.height ?? 1,
    opacity, zIndex: 0, activeStart: 0, activeEnd: duration / 1000,
    ...(activeClip.color ? { color: activeClip.color as PreviewLayer['color'] } : {}),
    ...(filter ? { lutId: filter.path, lutIntensity: project.filter?.intensity ?? 100 } : {}),
    ...(source.kind === 'image' && activeClip.photoMotion === 'gentleZoomIn' ? {
      transform: { crop: null, orientation: 0, rotate: 0, flipH: false, flipV: false,
        scale: 1 + 0.08 * Math.min(1, localOutputMs / Math.max(1, duration)), translateX: 0, translateY: 0 },
    } : {}),
  }] : []
  const watermark = project.watermark ? watermarks.find(item => item.id === project.watermark?.id) : null
  if (watermark && project.watermark) {
    const width = project.canvas.width * project.watermark.width
    const height = width * watermark.height / Math.max(1, watermark.width)
    const positioning = project.watermark.positioning
    const marginX = (positioning.marginX ?? 0) * project.canvas.width
    const marginY = (positioning.marginY ?? 0) * project.canvas.height
    let x = (project.canvas.width - width) / 2
    let y = project.canvas.height - height - marginY
    if (positioning.centerX !== undefined && positioning.centerY !== undefined) {
      x = positioning.centerX * project.canvas.width - width / 2
      y = positioning.centerY * project.canvas.height - height / 2
    } else {
      if (positioning.anchor.includes('left')) x = marginX
      if (positioning.anchor.includes('right')) x = project.canvas.width - width - marginX
      if (positioning.anchor.startsWith('top')) y = marginY
      if (positioning.anchor === 'center') y = (project.canvas.height - height) / 2
    }
    result.push({
      layerType: 'logo', filePath: watermark.path, dstX: x, dstY: y, dstW: width, dstH: height,
      srcX: 0, srcY: 0, srcW: 1, srcH: 1, opacity: project.watermark.opacity,
      zIndex: result.length + 1, activeStart: 0, activeEnd: duration / 1000,
    })
  }
  return result
}

export function LunaEditWorkspace({ active, projectId, onProjectIdChange, onProjectsChange,
  projectIndexOnly = false, refreshKey }: {
  active: boolean
  projectId: string | null
  onProjectIdChange(projectId: string | null): void
  onProjectsChange?(projects: EditProjectSummary[]): void
  projectIndexOnly?: boolean
  refreshKey?: number
}): JSX.Element {
  const [projects, setProjects] = useState<EditProjectSummary[]>([])
  const [media, setMedia] = useState<AiEditorLocalMedia[]>([])
  const [filters, setFilters] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [watermarks, setWatermarks] = useState<Array<{ id: string; name: string; path: string; width: number; height: number }>>([])
  const [project, setProject] = useState<LunaEditProject | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [selectedClipId, setSelectedClipId] = useState('')
  const [projectName, setProjectName] = useState('AI 剪辑')
  const [mediaSearch, setMediaSearch] = useState('')
  const [mediaKind, setMediaKind] = useState<'all' | AiEditorLocalMedia['kind']>('all')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [playheadMs, setPlayheadMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [syncState, setSyncState] = useState<EditingSyncState>('offline')
  const playheadRef = useRef(0)
  const syncingProjectIdsRef = useRef(new Set<string>())
  const syncingRemoteProjectsRef = useRef(false)

  useEffect(() => onProjectsChange?.(projects), [onProjectsChange, projects])

  function setPlayhead(milliseconds: number): void {
    playheadRef.current = milliseconds
    setPlayheadMs(milliseconds)
  }

  const currentClip = project?.clips.find(clip => clip.id === selectedClipId) ?? project?.clips[0] ?? null
  const currentSource = currentClip ? project?.sources.find(source => source.id === currentClip.sourceId) ?? null : null
  const selectedSource = project?.sources.find(source => source.id === selectedSourceId) ?? null
  const sourceById = useMemo(() => new Map(project?.sources.map(source => [source.id, source]) ?? []), [project?.sources])
  const visibleMedia = useMemo(() => {
    const query = mediaSearch.trim().toLocaleLowerCase()
    return media.filter(item => (mediaKind === 'all' || item.kind === mediaKind)
      && (!query || item.name.toLocaleLowerCase().includes(query)))
  }, [media, mediaKind, mediaSearch])
  const totalDurationMs = project?.clips.reduce((sum, clip) => sum + clipDuration(clip), 0) ?? 0
  const hasMissingClipSource = Boolean(project && project.clips.some(clip => {
    const source = project.sources.find(item => item.id === clip.sourceId)
    return !source || source.available === false || !source.path
  }))
  const hasMissingMusicSource = Boolean(project?.music && !project.sources.some(source => source.id === project.music?.sourceId
    && source.available !== false && source.path))
  const layers = useMemo(() => project ? previewLayers(project, filters, watermarks, playheadMs) : [], [filters, playheadMs, project, watermarks])

  const refresh = useCallback(async () => {
    const listedProjects = await window.luna.aiEditor.project.list()
    setProjects(listedProjects)
    if (projectIndexOnly) return
    const [listedMedia, listedFilters, listedWatermarks] = await Promise.all([
      window.luna.aiEditor.listLocalMedia({ limit: 500 }),
      window.luna.aiEditor.listFilters(),
      window.luna.aiEditor.listWatermarks(),
    ])
    setMedia(listedMedia)
    setFilters(listedFilters)
    setWatermarks(listedWatermarks)
  }, [projectIndexOnly])

  const syncProjectToPhone = useCallback(async (
    localProject: LunaEditProject,
    pairingAlreadyChecked = false,
  ): Promise<void> => {
    const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
    if (!endpoint || (!pairingAlreadyChecked && !await hasPairingForEndpoint(endpoint))) {
      setSyncState('offline')
      return
    }
    if (syncingProjectIdsRef.current.has(localProject.id)) return
    syncingProjectIdsRef.current.add(localProject.id)
    setSyncState('syncing')
    const wireProject = toLunaEditWireProject(localProject)
    const signature = editingSyncSignature(wireProject)
    try {
      const origin = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`).origin
      const baselineKey = `${origin}:${localProject.id}`
      const baselines = readEditingSyncBaselines()
      const baseline = baselines[baselineKey]
      if (baseline) {
        const remote = await requestEditingProject(endpoint, localProject.id)
        if (remote.deleted_at) {
          setSyncState('conflict')
          return
        }
        if (remote.revision !== baseline.revision) {
          if (remote.revision > baseline.revision && editingSyncSignature(remote.project) === signature) {
            baselines[baselineKey] = { revision: remote.revision, signature }
            localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
            setSyncState('synced')
            return
          }
          setSyncState('conflict')
          return
        }
        if (baseline.signature === signature) {
          setSyncState('synced')
          return
        }
        try {
          const saved = await writeEditingProject(endpoint, wireProject, baseline.revision)
          baselines[baselineKey] = { revision: saved.revision, signature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          setSyncState('synced')
          return
        } catch (error) {
          const remote = await requestEditingProject(endpoint, localProject.id).catch(() => null)
          if (remote && remote.revision > baseline.revision) {
            setSyncState('conflict')
            toast.error(`“${localProject.name}”手机与电脑都有修改，已保留两端版本`)
            return
          }
          throw error
        }
      }

      const index = await requestEditingProjects(endpoint)
      const existing = index.projects.find(item => item.id === localProject.id)
      if (existing) {
        const remote = await requestEditingProject(endpoint, localProject.id)
        if (!remote.deleted_at && editingSyncSignature(remote.project) === signature) {
          baselines[baselineKey] = { revision: remote.revision, signature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          setSyncState('synced')
          return
        }
        setSyncState('conflict')
        toast.error(`“${localProject.name}”手机已有同 ID 工程，已保留两端版本`)
        return
      }
      const created = await writeEditingProject(endpoint, wireProject, 0)
      baselines[baselineKey] = { revision: created.revision, signature }
      localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
      setSyncState('synced')
    } catch (value) {
      setSyncState('error')
      setError(value instanceof Error ? value.message : '剪辑工程同步失败')
    } finally {
      syncingProjectIdsRef.current.delete(localProject.id)
    }
  }, [])

  const syncRemoteProjectsFromPhone = useCallback(async (): Promise<boolean> => {
    const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
    if (!endpoint || localStorage.getItem(DIRECTOR_PAIRED_KEY) !== 'true'
      || syncingRemoteProjectsRef.current) return false
    syncingRemoteProjectsRef.current = true
    try {
      const origin = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`).origin
      const index = await requestEditingProjects(endpoint)
      let localProjects = await window.luna.aiEditor.project.list()
      let importedAny = false
      let foundConflict = false
      for (const summary of index.projects) {
        if (summary.deleted) {
          if (localProjects.some(item => item.projectId === summary.id)) foundConflict = true
          continue
        }
        const remote = await requestEditingProject(endpoint, summary.id)
        const baselineKey = `${origin}:${summary.id}`
        const baselines = readEditingSyncBaselines()
        const baseline = baselines[baselineKey]
        const existingSummary = localProjects.find(item => item.projectId === summary.id)
        const remoteSignature = editingSyncSignature(remote.project)
        const mobileState = remote.project.extensions?.['com.luna.mobile']
        const hasPendingPhoneVersion = Boolean(mobileState && typeof mobileState === 'object'
          && !Array.isArray(mobileState)
          && ('pending_native_project' in mobileState || 'pending_native_apply_error_revision' in mobileState))
        if (hasPendingPhoneVersion && existingSummary) {
          foundConflict = true
          continue
        }
        if (hasPendingPhoneVersion) foundConflict = true
        if (!existingSummary) {
          const imported = await window.luna.aiEditor.project.importSynced(remote.project)
          const localSignature = editingSyncSignature(toLunaEditWireProject(imported))
          baselines[baselineKey] = { revision: remote.revision, signature: localSignature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          localProjects = [...localProjects, { projectId: imported.id, projectName: imported.name,
            createdAt: imported.createdAt, updatedAt: imported.updatedAt, revision: imported.revision,
            clipCount: imported.clips.length }]
          importedAny = true
          continue
        }

        const { project: localProject } = await window.luna.aiEditor.project.load(summary.id)
        const localSignature = editingSyncSignature(toLunaEditWireProject(localProject))
        if (!baseline) {
          if (localSignature === remoteSignature) {
            baselines[baselineKey] = { revision: remote.revision, signature: localSignature }
            localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          } else {
            foundConflict = true
          }
          continue
        }
        if (remote.revision <= baseline.revision || localSignature === remoteSignature) {
          if (localSignature === remoteSignature && remote.revision > baseline.revision) {
            baselines[baselineKey] = { revision: remote.revision, signature: localSignature }
            localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          }
          continue
        }
        if (remoteSignature === baseline.signature) {
          baselines[baselineKey] = { revision: remote.revision, signature: baseline.signature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          continue
        }
        const activeUnsaved = project?.id === summary.id && dirty
        if (localSignature === baseline.signature && !activeUnsaved) {
          const imported = await window.luna.aiEditor.project.importSynced(remote.project, localProject.revision)
          const importedSignature = editingSyncSignature(toLunaEditWireProject(imported))
          baselines[baselineKey] = { revision: remote.revision, signature: importedSignature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          if (project?.id === summary.id) {
            setProject(imported)
            setSelectedClipId(imported.clips[0]?.id ?? '')
            setDirty(false)
          }
          importedAny = true
        } else if (remoteSignature !== baseline.signature) {
          foundConflict = true
        }
      }
      if (importedAny) await refresh()
      setSyncState(foundConflict ? 'conflict' : 'synced')
      return foundConflict
    } catch (value) {
      setSyncState('error')
      setError(value instanceof Error ? value.message : '剪辑工程同步失败')
      return false
    } finally {
      syncingRemoteProjectsRef.current = false
    }
  }, [dirty, project, refresh])

  const syncLocalProjectsToPhone = useCallback(async (): Promise<void> => {
    const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
    if (!endpoint || !await hasPairingForEndpoint(endpoint)) return
    const foundConflict = await syncRemoteProjectsFromPhone()
    const localProjects = await window.luna.aiEditor.project.list()
    for (const summary of localProjects) {
      const { project: localProject } = await window.luna.aiEditor.project.load(summary.projectId)
      await syncProjectToPhone(localProject, true)
    }
    if (foundConflict) setSyncState('conflict')
  }, [syncProjectToPhone, syncRemoteProjectsFromPhone])

  useEffect(() => {
    if (!active) return
    void refresh()
      .then(syncLocalProjectsToPhone)
      .catch(value => setError(value instanceof Error ? value.message : '工作区读取失败'))
  }, [active, refresh, refreshKey, syncLocalProjectsToPhone])

  const loadProject = useCallback(async (id: string) => {
    if (!id) {
      setProject(null)
      setSelectedClipId('')
      onProjectIdChange(null)
      return
    }
    setBusy(true)
    try {
      const loaded = await window.luna.aiEditor.project.load(id)
      setProject(loaded.project)
      setSelectedClipId(loaded.project.clips[0]?.id ?? '')
      setPlayhead(0)
      setPlaying(false)
      onProjectIdChange(id)
      setDirty(false)
      setError('')
      void syncProjectToPhone(loaded.project)
    } catch (value) {
      setError(value instanceof Error ? value.message : '剪辑工程读取失败')
    } finally { setBusy(false) }
  }, [onProjectIdChange, syncProjectToPhone])

  useEffect(() => {
    if (!active || !projectId) return
    void loadProject(projectId)
  }, [active, loadProject, projectId])

  useEffect(() => {
    if (!active || !project || dirty) return
    const timer = window.setInterval(() => {
      void syncLocalProjectsToPhone().catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [active, dirty, project, syncLocalProjectsToPhone])

  useEffect(() => {
    if (!playing || totalDurationMs <= 0) return
    let previousFrame = performance.now()
    let frame = 0
    const advance = (now: number) => {
      const next = playheadRef.current + now - previousFrame
      previousFrame = now
      if (next >= totalDurationMs) {
        setPlayhead(totalDurationMs)
        setPlaying(false)
        return
      }
      setPlayhead(next)
      frame = requestAnimationFrame(advance)
    }
    frame = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(frame)
  }, [playing, totalDurationMs])

  async function createProject(): Promise<void> {
    setBusy(true)
    try {
      const created = await window.luna.aiEditor.project.create(projectName)
      const loaded = await window.luna.aiEditor.project.load(created.projectId)
      setProject(loaded.project)
      setPlayhead(0)
      onProjectIdChange(created.projectId)
      setDirty(false)
      await refresh()
      void syncProjectToPhone(loaded.project)
    } catch (value) {
      setError(value instanceof Error ? value.message : '剪辑工程创建失败')
    } finally { setBusy(false) }
  }

  async function addMediaToProject(mediaId: string): Promise<void> {
    if (!project || busy) return
    setBusy(true)
    try {
      const updated = await window.luna.aiEditor.project.addMedia(project.id, [mediaId])
      setProject(updated)
      setSelectedSourceId(updated.sources.find(source => source.mediaId === mediaId)?.id ?? '')
      setDirty(false)
      setError('')
      void syncProjectToPhone(updated)
    } catch (value) {
      setError(value instanceof Error ? value.message : '素材加入工程失败')
    } finally { setBusy(false) }
  }

  function updateProject(update: (current: LunaEditProject) => LunaEditProject): void {
    setProject(current => current ? update(current) : current)
    setDirty(true)
  }

  function appendToTimeline(source: EditProjectSource): void {
    if (!project) return
    const end = source.durationMs ?? (source.kind === 'image' ? 5000 : null)
    if (!end || end <= 0) { setError('素材时长不可用'); return }
    const clip: EditProjectClip = {
      id: crypto.randomUUID(), sourceId: source.id, sourceStartMs: 0, sourceEndMs: end,
      timelineStartMs: project.clips.reduce((total, item) => total + clipDuration(item), 0), volume: 1,
      ...(source.kind === 'image' ? { photoMotion: 'gentleZoomIn' as const } : {}),
    }
    updateProject(current => ({ ...current, clips: [...orderedClips([...current.clips, clip])] }))
    setSelectedClipId(clip.id)
    setError('')
  }

  async function saveProject(): Promise<void> {
    if (!project || !dirty || busy) return
    setBusy(true)
    try {
      const saved = await window.luna.aiEditor.project.save({ ...project, clips: orderedClips(project.clips) }, project.revision)
      setProject(saved)
      setDirty(false)
      setError('')
      await refresh()
      await syncProjectToPhone(saved)
      toast.success('剪辑工程已保存')
    } catch (value) {
      setError(value instanceof Error ? value.message : '剪辑工程保存失败')
    } finally { setBusy(false) }
  }

  function moveClip(clipId: string, delta: -1 | 1): void {
    if (!project) return
    const clips = [...project.clips]
    const index = clips.findIndex(clip => clip.id === clipId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= clips.length) return
    ;[clips[index], clips[target]] = [clips[target], clips[index]]
    updateProject(current => ({ ...current, clips: orderedClips(clips) }))
  }

  async function exportProject(): Promise<void> {
    if (!project || project.clips.length === 0 || busy) return
    setBusy(true)
    try {
      let current = project
      if (dirty) {
        current = await window.luna.aiEditor.project.save({ ...project, clips: orderedClips(project.clips) }, project.revision)
        setProject(current)
        setDirty(false)
      }
      if (current !== project) await syncProjectToPhone(current)
      const outputPath = await window.luna.aiEditor.exportProject(current.id)
      if (!outputPath) return
      toast.success('视频已导出')
    } catch (value) {
      setError(value instanceof Error ? value.message : '视频导出失败')
    } finally { setBusy(false) }
  }

  function setMusic(source: EditProjectSource): void {
    if (!project || source.kind !== 'audio' || !source.durationMs) return
    updateProject(current => ({ ...current, music: { sourceId: source.id, sourceStartMs: 0,
      sourceEndMs: Math.min(source.durationMs!, totalDurationMs || source.durationMs!), volume: 0.75 }, musicEnabled: true }))
  }

  async function addAndSetMusic(mediaId: string): Promise<void> {
    if (!project || busy) return
    setBusy(true)
    try {
      const updated = await window.luna.aiEditor.project.addMedia(project.id, [mediaId])
      setProject(updated)
      const source = updated.sources.find(item => item.mediaId === mediaId)
      if (!source || source.kind !== 'audio') throw new Error('配乐素材不可用')
      let durationMsValue = source.durationMs
      if (!durationMsValue) {
        const metadata = (await window.luna.aiEditor.getLocalMediaMetadata([mediaId]))[0]
        durationMsValue = metadata?.durationSec ? Math.round(metadata.durationSec * 1000) : null
      }
      if (!durationMsValue) throw new Error('配乐时长不可用')
      setProject(current => current ? { ...current, music: { sourceId: source.id, sourceStartMs: 0,
        sourceEndMs: Math.min(durationMsValue!, totalDurationMs || durationMsValue!), volume: 0.75 }, musicEnabled: true } : current)
      setDirty(true)
      setError('')
    } catch (value) {
      setError(value instanceof Error ? value.message : '配乐加入失败')
    } finally { setBusy(false) }
  }

  return <section className="ai-edit-panel ai-edit-workspace">
    <header className="ai-edit-toolbar">
      <Select value={project?.id ?? 'none'} disabled={busy} placeholder="选择剪辑工程"
        options={[{ value: 'none', label: '未选择工程' }, ...projects.map(item => ({ value: item.projectId, label: `${item.projectName} · ${item.clipCount} 段` }))]}
        onValueChange={id => void loadProject(id === 'none' ? '' : id)} />
      <input value={projectName} aria-label="新剪辑工程名称" onChange={event => setProjectName(event.target.value)} />
      <Button size="compact" disabled={busy || Boolean(project)} icon={<Plus size={14} />} onClick={() => void createProject()}>新建工程</Button>
      <span>{project ? `版本 ${project.revision}${dirty ? ' · 未保存' : ''}` : '选择或新建工程'}{project ? ` · ${syncState === 'syncing' ? '同步中' : syncState === 'synced' ? '已同步' : syncState === 'conflict' ? '两端冲突' : syncState === 'error' ? '同步失败' : '未连接手机'}` : ''}</span>
      <Button size="compact" disabled={!project || !dirty || busy} icon={<Save size={14} />} onClick={() => void saveProject()}>保存</Button>
      <Button size="compact" variant="primary" disabled={!project || project.clips.length === 0 || hasMissingClipSource || hasMissingMusicSource || busy} icon={<Download size={14} />} onClick={() => void exportProject()}>导出</Button>
    </header>
    <aside className="ai-edit-library">
      <div className="ai-edit-library-heading"><strong>素材库</strong><span>{visibleMedia.length} / {media.length}</span></div>
      <input className="ai-edit-media-search" aria-label="搜索素材" placeholder="搜索素材名称" value={mediaSearch}
        onChange={event => setMediaSearch(event.target.value)} />
      <div className="ai-edit-media-filters" role="group" aria-label="素材类型">
        {(['all', 'video', 'image', 'audio'] as const).map(kind => <button key={kind} type="button"
          className={mediaKind === kind ? 'active' : ''} aria-pressed={mediaKind === kind} onClick={() => setMediaKind(kind)}>
          {kind === 'all' ? '全部' : kind === 'video' ? '视频' : kind === 'image' ? '照片' : '音频'}
        </button>)}
      </div>
      <div className="ai-edit-media-list">
        {visibleMedia.map(item => {
          const source = project?.sources.find(value => value.mediaId === item.mediaId)
          const canUseSource = Boolean(source && source.available !== false && source.path)
          const isSelected = Boolean(source && source.id === selectedSourceId)
          return <div key={item.mediaId} className={`ai-edit-source-row${isSelected ? ' active' : ''}`}>
            <button type="button" className="ai-edit-source-copy" disabled={!source}
              onClick={() => setSelectedSourceId(source?.id ?? '')}>
              <strong>{item.name}</strong><small>{item.kind === 'video' ? '视频' : item.kind === 'audio' ? '音频' : '照片'}{item.duration ? ` · ${clock(item.duration * 1000)}` : ''}</small>
            </button>
            {item.kind === 'audio'
              ? canUseSource && source
                ? <Button size="mini" disabled={busy} icon={<Music2 size={12} />} onClick={() => setMusic(source)}>设为配乐</Button>
                : <Button size="mini" disabled={!project || busy} icon={<Music2 size={12} />} onClick={() => void addAndSetMusic(item.mediaId)}>加入配乐</Button>
              : canUseSource && source
                ? <Button size="mini" disabled={busy} icon={<Plus size={12} />} onClick={() => appendToTimeline(source)}>上时间线</Button>
                : <Button size="mini" disabled={!project || busy} icon={<Plus size={12} />} onClick={() => void addMediaToProject(item.mediaId)}>加入工程</Button>}
          </div>
        })}
        {visibleMedia.length === 0 && <div className="ai-edit-media-empty">没有匹配的素材</div>}
      </div>
    </aside>
    <div className="ai-edit-preview-stage">
      {!project ? <div className="ai-edit-stage-empty">
        <span className="ai-edit-stage-empty-icon"><Film size={19} /></span>
        <strong>选择或新建剪辑工程</strong>
        <small>打开工程后，可从左侧素材库添加视频或照片</small>
      </div>
        : layers.length ? <LrcRender className="ai-edit-preview-canvas" layers={layers} active={active}
          canvasWidth={project.canvas.width} canvasHeight={project.canvas.height} maxSide={1600}
          compositionTime={0} onError={setError} /> : <div className="ai-edit-stage-empty">
          <span className="ai-edit-stage-empty-icon"><Film size={19} /></span>
          <strong>{hasMissingClipSource ? '素材未关联' : '时间线为空'}</strong>
          <small>{hasMissingClipSource ? '在左侧素材库关联本地文件后即可继续' : '从左侧素材库选择素材并加入时间线'}</small>
        </div>}
      <div className="ai-edit-playback">
        <Button size="mini" disabled={!project || !totalDurationMs} icon={playing ? <Pause size={13} /> : <Play size={13} />}
          onClick={() => { if (playheadMs >= totalDurationMs) setPlayhead(0); setPlaying(value => !value) }} />
        <span>{clock(playheadMs)} / {clock(totalDurationMs)}</span>
        <input aria-label="时间线播放位置" type="range" min={0} max={Math.max(1, totalDurationMs)} value={Math.min(playheadMs, totalDurationMs)}
          disabled={!project || !totalDurationMs}
          onChange={event => { setPlaying(false); setPlayhead(Number(event.target.value)) }} />
      </div>
    </div>
      <aside className="ai-edit-inspector">
        {!project ? <div className="ai-edit-inspector-empty">新建工程后可调整片段、配乐与画面效果</div> : <>
        <h3>{currentClip && currentSource ? currentSource.name : '片段参数'}</h3>
        {currentClip && currentSource && currentSource.available !== false && currentSource.path ? <>
          <label>源起点（秒）<input type="number" min={0} step={0.1} value={(currentClip.sourceStartMs / 1000).toFixed(1)} onChange={event => {
            const value = Math.max(0, Math.round(Number(event.target.value) * 1000))
            updateProject(current => ({ ...current, clips: orderedClips(current.clips.map(clip => clip.id === currentClip.id
              ? { ...clip, sourceStartMs: Math.min(value, clip.sourceEndMs - 250) } : clip)) }))
          }} /></label>
          <label>源终点（秒）<input type="number" min={0.25} step={0.1} max={currentSource.durationMs ? currentSource.durationMs / 1000 : undefined}
            value={(currentClip.sourceEndMs / 1000).toFixed(1)} onChange={event => {
              const requested = Math.round(Number(event.target.value) * 1000)
              const max = currentSource.durationMs ?? requested
              updateProject(current => ({ ...current, clips: orderedClips(current.clips.map(clip => clip.id === currentClip.id
                ? { ...clip, sourceEndMs: Math.max(clip.sourceStartMs + 250, Math.min(requested, max)) } : clip)) }))
            }} /></label>
          <label>原声音量 {Math.round(currentClip.volume * 100)}%
            <input type="range" min={0} max={100} value={Math.round(currentClip.volume * 100)} onChange={event => updateProject(current => ({
              ...current, clips: current.clips.map(clip => clip.id === currentClip.id ? { ...clip, volume: Number(event.target.value) / 100 } : clip),
            }))} />
          </label>
          <label>曝光 {Number(currentClip.color?.exposure ?? 0).toFixed(1)} EV
            <input type="range" min={-2} max={2} step={0.1} value={currentClip.color?.exposure ?? 0} onChange={event => updateProject(current => ({
              ...current, clips: current.clips.map(clip => clip.id === currentClip.id ? { ...clip, color: { ...clip.color, exposure: Number(event.target.value) } } : clip),
            }))} />
          </label>
          <label>饱和度 {Math.round((currentClip.color?.saturation ?? 0) * 100)}%
            <input type="range" min={-100} max={100} value={currentClip.color?.saturation ?? 0} onChange={event => updateProject(current => ({
              ...current, clips: current.clips.map(clip => clip.id === currentClip.id ? { ...clip, color: { ...clip.color, saturation: Number(event.target.value) } } : clip),
            }))} />
          </label>
          <div className="ai-edit-actions">
            <Button size="mini" disabled={project.clips[0]?.id === currentClip.id} icon={<ArrowUp size={13} />} onClick={() => moveClip(currentClip.id, -1)}>前移</Button>
            <Button size="mini" disabled={project.clips[project.clips.length - 1]?.id === currentClip.id} icon={<ArrowDown size={13} />} onClick={() => moveClip(currentClip.id, 1)}>后移</Button>
            <Button size="mini" variant="danger" icon={<Trash2 size={13} />} onClick={() => {
              const clips = orderedClips(project.clips.filter(clip => clip.id !== currentClip.id))
              updateProject(current => ({ ...current, clips }))
              setSelectedClipId(clips[0]?.id ?? '')
            }}>移除</Button>
          </div>
        </> : currentClip && currentSource ? <p>素材未关联：{currentSource.name}</p> : <p>从左侧素材库加入片段到时间线。</p>}
        <div className="ai-edit-editor-settings">
          <strong>配乐</strong>
          <Select value={project.music ? project.music.sourceId : 'none'} disabled={busy}
            options={[{ value: 'none', label: '无配乐' }, ...project.sources.filter(source => source.kind === 'audio').map(source => ({ value: source.id, label: source.name }))]}
            onValueChange={sourceId => sourceId === 'none' ? updateProject(current => ({ ...current, music: null })) : setMusic(project.sources.find(source => source.id === sourceId)!)} />
          {project.music && <label>{Math.round(project.music.volume * 100)}%
            <input type="range" min={0} max={100} value={Math.round(project.music.volume * 100)} onChange={event => updateProject(current => ({
              ...current, music: current.music ? { ...current.music, volume: Number(event.target.value) / 100 } : null,
            }))} />
          </label>}
          <strong>滤镜</strong>
          <Select value={project.filter?.id ?? 'none'} disabled={busy}
            options={[{ value: 'none', label: '无滤镜' }, ...filters.map(filter => ({ value: filter.id, label: filter.name }))]}
            onValueChange={id => updateProject(current => ({ ...current, filter: id === 'none' ? null : { id, intensity: current.filter?.intensity ?? 100, enabled: true } }))} />
          {project.filter && <label>强度 {Math.round(project.filter.intensity)}%
            <input type="range" min={0} max={100} value={project.filter.intensity} onChange={event => updateProject(current => ({
              ...current, filter: current.filter ? { ...current.filter, intensity: Number(event.target.value) } : null,
            }))} />
          </label>}
          <strong>水印</strong>
          <Select value={project.watermark?.id ?? 'none'} disabled={busy}
            options={[{ value: 'none', label: '无水印' }, ...watermarks.map(item => ({ value: item.id, label: item.name }))]}
            onValueChange={id => updateProject(current => ({ ...current, watermark: id === 'none' ? null : {
              id, width: 0.16, opacity: 1,
              positioning: { anchor: 'bottom-right', targetWidth: 0.16, marginX: 0.04, marginY: 0.04 },
            } }))} />
          {project.watermark && <label>透明度 {Math.round(project.watermark.opacity * 100)}%
            <input type="range" min={0} max={100} value={Math.round(project.watermark.opacity * 100)} onChange={event => updateProject(current => ({
              ...current, watermark: current.watermark ? { ...current.watermark, opacity: Number(event.target.value) / 100 } : null,
            }))} />
          </label>}
        </div>
        </>}
      </aside>
      <div className="ai-edit-timeline">
        <div className="ai-edit-timeline-head"><strong>时间线</strong><span>{project?.clips.length ?? 0} 段</span><span>{clock(totalDurationMs)}</span></div>
        <div className="ai-edit-clip-list">
          {orderedClips(project?.clips ?? []).map(clip => {
            const source = sourceById.get(clip.sourceId)
            if (!source) return null
            return <button type="button" key={clip.id} className={`ai-edit-clip${currentClip?.id === clip.id ? ' active' : ''}`}
              style={{ flexGrow: clipDuration(clip) }} onClick={() => setSelectedClipId(clip.id)}>
              <strong>{source.name}</strong><small>{clock(clip.sourceStartMs)}–{clock(clip.sourceEndMs)}</small>
            </button>
          })}
          {(!project || project.clips.length === 0) && <span className="ai-edit-empty-inline">素材加入工程后可编排片段顺序</span>}
        </div>
      </div>
    {error && <div className="ai-edit-error" role="alert">{error}</div>}
    <datalist id="ai-edit-source-list">{media.map(item => <option key={item.mediaId} value={item.name} />)}</datalist>
    <span hidden>{selectedSource?.name}</span>
  </section>
}
