import { useCallback, useEffect, useRef, useState } from 'react'

import type { LunaEditProject } from '../shared/types/aiEditing'
import type { LunaEditProjectSyncRecord } from '../shared/types/lunaEditingSync'
import { toLunaEditWireProject } from '../lib/aiEditingWire'
import {
  requestEditingProject,
  requestEditingProjects,
  resolveEditingProjectFromPhone,
  writeEditingProject,
} from '../lib/editingLanProjects'

export type EditingSyncState = 'offline' | 'syncing' | 'synced' | 'conflict' | 'error'

export interface EditingProjectConflict {
  local: LunaEditProject
  remote: LunaEditProjectSyncRecord
}

type EditingSyncBaseline = { revision: number; signature: string }

const DIRECTOR_ENDPOINT_KEY = 'luna.director-lab.endpoint'
const DIRECTOR_PAIRED_KEY = 'luna.director-lab.paired'
const EDITING_SYNC_BASELINE_KEY = 'luna.ai-editing.sync-baselines'

export interface UseLunaEditProjectSyncOptions {
  active: boolean
  refreshKey?: number
  project: LunaEditProject | null
  dirty: boolean
  refresh(): Promise<void>
  setProject(project: LunaEditProject | null): void
  setSelectedClipId(clipId: string): void
  setDirty(dirty: boolean): void
  setError(message: string): void
}

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

function hasPendingPhoneVersion(project: LunaEditProjectSyncRecord['project']): boolean {
  const mobile = project.extensions?.['com.luna.mobile']
  return Boolean(mobile && typeof mobile === 'object' && !Array.isArray(mobile)
    && ('pending_native_project' in mobile || 'pending_native_apply_error_revision' in mobile))
}

export function useLunaEditProjectSync({
  active,
  refreshKey,
  project,
  dirty,
  refresh,
  setProject,
  setSelectedClipId,
  setDirty,
  setError,
}: UseLunaEditProjectSyncOptions) {
  const [syncState, setSyncState] = useState<EditingSyncState>('offline')
  const [conflicts, setConflicts] = useState<EditingProjectConflict[]>([])
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null)
  const [conflictError, setConflictError] = useState('')
  const [conflictProgress, setConflictProgress] = useState('')
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflictStatusCollapsed, setConflictStatusCollapsed] = useState(false)
  const conflictsByIdRef = useRef(new Map<string, EditingProjectConflict>())
  const syncingProjectIdsRef = useRef(new Set<string>())
  const syncingRemoteProjectsRef = useRef(false)
  const resolvingConflictRef = useRef(false)
  const conflictDialogDismissedRef = useRef(false)
  const projectRef = useRef(project)
  const dirtyRef = useRef(dirty)
  projectRef.current = project
  dirtyRef.current = dirty

  const rememberConflict = useCallback((local: LunaEditProject, remote: LunaEditProjectSyncRecord) => {
    conflictsByIdRef.current.set(local.id, { local, remote })
    setConflicts([...conflictsByIdRef.current.values()])
    setConflictError('')
    setSyncState('conflict')
    if (!conflictDialogDismissedRef.current && !resolvingConflictRef.current) {
      setConflictStatusCollapsed(false)
      setConflictDialogOpen(true)
    }
  }, [])

  const syncProjectToPhone = useCallback(async (localProject: LunaEditProject): Promise<void> => {
    if (conflictsByIdRef.current.has(localProject.id)) return
    const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
    if (!endpoint || !await hasPairingForEndpoint(endpoint)) {
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
        if (remote.deleted_at || remote.revision !== baseline.revision
          && editingSyncSignature(remote.project) !== signature) {
          rememberConflict(localProject, remote)
          return
        }
        if (remote.revision !== baseline.revision) {
          baselines[baselineKey] = { revision: remote.revision, signature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          setSyncState('synced')
          return
        }
        if (baseline.signature === signature) {
          setSyncState('synced')
          return
        }
        try {
          const saved = await writeEditingProject(endpoint, wireProject, baseline.revision)
          const imported = await window.luna.aiEditor.project.importSynced(saved.project, localProject.revision)
          baselines[baselineKey] = { revision: saved.revision, signature: editingSyncSignature(toLunaEditWireProject(imported)) }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          setSyncState('synced')
          return
        } catch (error) {
          const latest = await requestEditingProject(endpoint, localProject.id).catch(() => null)
          if (latest && (latest.deleted_at || latest.revision > baseline.revision)) {
            rememberConflict(localProject, latest)
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
        rememberConflict(localProject, remote)
        return
      }
      let created: LunaEditProjectSyncRecord
      try {
        created = await writeEditingProject(endpoint, wireProject, 0)
      } catch (error) {
        const remote = await requestEditingProject(endpoint, localProject.id).catch(() => null)
        if (remote) {
          rememberConflict(localProject, remote)
          return
        }
        throw error
      }
      const imported = await window.luna.aiEditor.project.importSynced(created.project, localProject.revision)
      baselines[baselineKey] = { revision: created.revision, signature: editingSyncSignature(toLunaEditWireProject(imported)) }
      localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
      setSyncState('synced')
    } catch (value) {
      setSyncState('error')
      setError(value instanceof Error ? value.message : '剪辑工程同步失败')
    } finally {
      syncingProjectIdsRef.current.delete(localProject.id)
    }
  }, [rememberConflict, setError])

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
        if (conflictsByIdRef.current.has(summary.id)) {
          foundConflict = true
          continue
        }
        const remote = await requestEditingProject(endpoint, summary.id)
        const baselineKey = `${origin}:${summary.id}`
        const baselines = readEditingSyncBaselines()
        const baseline = baselines[baselineKey]
        const existingSummary = localProjects.find(item => item.projectId === summary.id)
        if (summary.deleted) {
          if (existingSummary) {
            const { project: localProject } = await window.luna.aiEditor.project.load(summary.id)
            rememberConflict(localProject, remote)
            foundConflict = true
          }
          continue
        }
        const remoteSignature = editingSyncSignature(remote.project)
        if (hasPendingPhoneVersion(remote.project)) {
          if (existingSummary) {
            const { project: localProject } = await window.luna.aiEditor.project.load(summary.id)
            rememberConflict(localProject, remote)
            foundConflict = true
            continue
          }
          const phoneVersion = await resolveEditingProjectFromPhone(endpoint, summary.id, remote.revision)
          const imported = await window.luna.aiEditor.project.importSynced(phoneVersion.project)
          const localSignature = editingSyncSignature(toLunaEditWireProject(imported))
          baselines[baselineKey] = { revision: phoneVersion.revision, signature: localSignature }
          localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
          localProjects = [...localProjects, { projectId: imported.id, projectName: imported.name,
            createdAt: imported.createdAt, updatedAt: imported.updatedAt, revision: imported.revision,
            clipCount: imported.clips.length }]
          importedAny = true
          continue
        }
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
            rememberConflict(localProject, remote)
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
        } else {
          rememberConflict(localProject, remote)
          foundConflict = true
        }
      }
      if (importedAny) await refresh()
      setSyncState(conflictsByIdRef.current.size ? 'conflict' : foundConflict ? 'conflict' : 'synced')
      return foundConflict
    } catch (value) {
      setSyncState('error')
      setError(value instanceof Error ? value.message : '剪辑工程同步失败')
      return false
    } finally {
      syncingRemoteProjectsRef.current = false
    }
  }, [dirty, project, refresh, rememberConflict, setDirty, setError, setProject, setSelectedClipId])

  const syncLocalProjectsToPhone = useCallback(async (): Promise<void> => {
    if (conflictsByIdRef.current.size) {
      setSyncState('conflict')
      return
    }
    const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
    if (!endpoint || !await hasPairingForEndpoint(endpoint)) return
    const foundConflict = await syncRemoteProjectsFromPhone()
    const localProjects = await window.luna.aiEditor.project.list()
    for (const summary of localProjects) {
      if (conflictsByIdRef.current.has(summary.projectId)) continue
      const { project: localProject } = await window.luna.aiEditor.project.load(summary.projectId)
      await syncProjectToPhone(localProject)
    }
    if (conflictsByIdRef.current.size || foundConflict) setSyncState('conflict')
  }, [syncProjectToPhone, syncRemoteProjectsFromPhone])

  const openConflictDialog = useCallback(() => {
    conflictDialogDismissedRef.current = false
    setConflictError('')
    setConflictDialogOpen(true)
  }, [])

  const collapseConflictStatus = useCallback(() => setConflictStatusCollapsed(true), [])
  const expandConflictStatus = useCallback(() => setConflictStatusCollapsed(false), [])

  const resolveConflict = useCallback(async (source: 'phone' | 'computer'): Promise<void> => {
    const conflict = conflictsByIdRef.current.values().next().value as EditingProjectConflict | undefined
    if (!conflict || resolvingConflictRef.current) return
    resolvingConflictRef.current = true
    conflictDialogDismissedRef.current = true
    setConflictDialogOpen(false)
    setConflictStatusCollapsed(false)
    setResolvingConflictId(conflict.local.id)
    setConflictError('')
    setConflictProgress('')
    function waitForStep<T>(label: string, operation: Promise<T>): Promise<T> {
      setConflictProgress(label)
      return operation
    }
    try {
      const endpoint = localStorage.getItem(DIRECTOR_ENDPOINT_KEY)?.trim()
      if (!endpoint || !await waitForStep('正在检查手机连接…', hasPairingForEndpoint(endpoint))) {
        throw new Error('手机尚未连接')
      }
      const origin = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`).origin
      const baselineKey = `${origin}:${conflict.local.id}`
      const remote = await waitForStep('正在读取手机工程…', requestEditingProject(endpoint, conflict.local.id))
      const { project: localProject } = await waitForStep('正在读取电脑工程…',
        window.luna.aiEditor.project.load(conflict.local.id))
      const baselines = readEditingSyncBaselines()
      if (source === 'phone') {
        if (remote.deleted_at) {
          await waitForStep('正在将手机删除同步到电脑…', window.luna.aiEditor.project.delete(localProject.id))
          delete baselines[baselineKey]
          if (projectRef.current?.id === localProject.id && !dirtyRef.current) {
            setProject(null)
            setSelectedClipId('')
            setDirty(false)
          }
        } else {
          const phoneVersion = hasPendingPhoneVersion(remote.project)
            ? await waitForStep('正在读取手机最新版本…',
              resolveEditingProjectFromPhone(endpoint, localProject.id, remote.revision))
            : remote
          const imported = await waitForStep('正在用手机版本更新电脑…',
            window.luna.aiEditor.project.importSynced(phoneVersion.project, localProject.revision))
          baselines[baselineKey] = { revision: phoneVersion.revision,
            signature: editingSyncSignature(toLunaEditWireProject(imported)) }
          if (projectRef.current?.id === localProject.id && !dirtyRef.current) {
            setProject(imported)
            setSelectedClipId(imported.clips[0]?.id ?? '')
            setDirty(false)
          }
        }
      } else {
        const saved = await waitForStep('正在用电脑版本更新手机…',
          writeEditingProject(endpoint, toLunaEditWireProject(localProject), remote.revision,
            remote.deleted_at !== null))
        const imported = await waitForStep('正在确认电脑工程版本…',
          window.luna.aiEditor.project.importSynced(saved.project, localProject.revision))
        baselines[baselineKey] = { revision: saved.revision,
          signature: editingSyncSignature(toLunaEditWireProject(imported)) }
        if (projectRef.current?.id === localProject.id && !dirtyRef.current) {
          setProject(imported)
          setSelectedClipId(imported.clips[0]?.id ?? '')
          setDirty(false)
        }
      }
      localStorage.setItem(EDITING_SYNC_BASELINE_KEY, JSON.stringify(baselines))
      conflictsByIdRef.current.delete(conflict.local.id)
      setConflicts([...conflictsByIdRef.current.values()])
      setSyncState(conflictsByIdRef.current.size ? 'conflict' : 'synced')
      try {
        await waitForStep('正在刷新工程列表…', refresh())
      } catch (value) {
        setError(value instanceof Error ? value.message : '工作区刷新失败')
      }
      if (conflictsByIdRef.current.size > 0) setConflictStatusCollapsed(false)
    } catch (value) {
      const message = value instanceof Error ? value.message : '同步处理失败，请重试'
      setConflictError(message)
      setConflictStatusCollapsed(false)
      setSyncState('conflict')
    } finally {
      resolvingConflictRef.current = false
      setResolvingConflictId(null)
      setConflictProgress('')
    }
  }, [refresh, setDirty, setError, setProject, setSelectedClipId])

  useEffect(() => {
    if (!active) return
    void refresh()
      .then(syncLocalProjectsToPhone)
      .catch(value => setError(value instanceof Error ? value.message : '工作区读取失败'))
  }, [active, refresh, refreshKey, setError, syncLocalProjectsToPhone])

  useEffect(() => {
    if (!active || dirty) return
    const timer = window.setInterval(() => {
      void syncLocalProjectsToPhone().catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [active, dirty, project, syncLocalProjectsToPhone])

  return { syncState, conflicts, resolvingConflictId, conflictError, conflictProgress, conflictDialogOpen,
    conflictStatusCollapsed, openConflictDialog, collapseConflictStatus, expandConflictStatus,
    syncProjectToPhone, resolveConflict }
}
