export type LunaEditWireMediaKind = 'video' | 'image' | 'audio'

export interface LunaEditWireMedia {
  source_id: string
  media_id: string
  name: string
  kind: LunaEditWireMediaKind
  duration_ms: number | null
  width: number | null
  height: number | null
}

export interface LunaEditWireClip {
  id: string
  source_id: string
  source_start_ms: number
  source_end_ms: number
  timeline_start_ms: number
  volume: number
  color?: Record<string, unknown>
  crop?: { left: number; top: number; width: number; height: number }
  photo_motion?: 'none' | 'gentleZoomIn'
  speed_curve?: {
    interpolation: 'linear' | 'smooth'
    points: Array<{ u: number; speed: number }>
  }
  fade_out_ms?: number
}

export interface LunaEditWireProject {
  schema: 'luna-edit-project-v1'
  id: string
  name: string
  created_at: string
  updated_at: string
  director_plan_id: string | null
  canvas: { width: number; height: number; fps: number }
  media: LunaEditWireMedia[]
  clips: LunaEditWireClip[]
  music: {
    source_id: string
    source_start_ms: number
    source_end_ms: number
    timeline_start_ms: 0
    volume: number
    timing?: {
      bpm: number
      duration: number
      beat_times: number[]
      downbeats: number[]
      percussion_hits: Array<{ time: number; pitch: number; velocity: number }>
    }
  } | null
  look: {
    filter: { id: string; intensity: number; enabled: boolean } | null
    watermark: Record<string, unknown> | null
  }
  extensions: Record<string, unknown>
}

export interface LunaEditProjectSyncSummary {
  id: string
  name: string
  revision: number
  updated_at: string
  deleted: boolean
  clip_count: number
  media_ref_count: number
}

export interface LunaEditProjectSyncIndex {
  service: 'luna-ka-editing'
  api_version: 1
  generated_at: string
  project_count: number
  projects: LunaEditProjectSyncSummary[]
}

export interface LunaEditProjectSyncRecord {
  service: 'luna-ka-editing'
  api_version: 1
  project: LunaEditWireProject
  revision: number
  updated_at: string
  deleted_at: string | null
}
