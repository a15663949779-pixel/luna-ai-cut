import type {
  LunaEditProjectSyncIndex,
  LunaEditProjectSyncRecord,
  LunaEditWireProject,
} from '../shared/types/lunaEditingSync'
import { normalizeEndpoint } from './directorLanPlans'

export async function requestEditingProjects(endpoint: string): Promise<LunaEditProjectSyncIndex> {
  const base = normalizeEndpoint(endpoint)
  const response = await window.luna.lunaKaHttpClient.request<LunaEditProjectSyncIndex>(
    base,
    '/api/v1/editing/projects',
  )
  if (response.service !== 'luna-ka-editing' || response.api_version !== 1 || !Array.isArray(response.projects)) {
    throw new Error('手机返回的剪辑项目索引不兼容')
  }
  return response
}

export async function requestEditingProject(
  endpoint: string,
  projectId: string,
): Promise<LunaEditProjectSyncRecord> {
  const base = normalizeEndpoint(endpoint)
  const response = await window.luna.lunaKaHttpClient.request<LunaEditProjectSyncRecord>(
    base,
    `/api/v1/editing/projects/${encodeURIComponent(projectId)}`,
  )
  if (response.service !== 'luna-ka-editing' || response.api_version !== 1 || response.project.id !== projectId) {
    throw new Error('手机返回的剪辑项目格式不兼容')
  }
  return response
}

export async function writeEditingProject(
  endpoint: string,
  project: LunaEditWireProject,
  expectedRevision: number,
  restore = false,
): Promise<LunaEditProjectSyncRecord> {
  const base = normalizeEndpoint(endpoint)
  const method = expectedRevision === 0 ? 'POST' : 'PATCH'
  const response = await window.luna.lunaKaHttpClient.request<LunaEditProjectSyncRecord>(
    base,
    `/api/v1/editing/projects/${encodeURIComponent(project.id)}`,
    { method, body: { expected_revision: expectedRevision, project, restore } },
  )
  if (response.service !== 'luna-ka-editing' || response.api_version !== 1 || response.project.id !== project.id) {
    throw new Error('手机返回的剪辑项目格式不兼容')
  }
  return response
}

export async function resolveEditingProjectFromPhone(
  endpoint: string,
  projectId: string,
  expectedRevision: number,
): Promise<LunaEditProjectSyncRecord> {
  const base = normalizeEndpoint(endpoint)
  const response = await window.luna.lunaKaHttpClient.request<LunaEditProjectSyncRecord>(
    base,
    `/api/v1/editing/projects/${encodeURIComponent(projectId)}/resolve-phone`,
    { method: 'POST', body: { expected_revision: expectedRevision } },
  )
  if (response.service !== 'luna-ka-editing' || response.api_version !== 1
    || response.project.id !== projectId || response.deleted_at !== null) {
    throw new Error('手机返回的剪辑工程格式不兼容')
  }
  return response
}

export async function deleteEditingProject(
  endpoint: string,
  projectId: string,
  expectedRevision: number,
): Promise<LunaEditProjectSyncRecord> {
  const base = normalizeEndpoint(endpoint)
  return window.luna.lunaKaHttpClient.request<LunaEditProjectSyncRecord>(
    base,
    `/api/v1/editing/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE', body: { expected_revision: expectedRevision } },
  )
}
