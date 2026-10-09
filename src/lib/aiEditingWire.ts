import type { LunaEditProject, EditProjectSource } from '../shared/types/aiEditing'
import type { LunaEditWireMedia, LunaEditWireProject } from '../shared/types/lunaEditingSync'

function wireMedia(source: EditProjectSource): LunaEditWireMedia {
  return {
    source_id: source.id,
    media_id: source.syncMediaId ?? source.mediaId,
    name: source.name,
    kind: source.kind,
    duration_ms: source.durationMs,
    width: source.width,
    height: source.height,
  }
}

export function toLunaEditWireProject(project: LunaEditProject): LunaEditWireProject {
  const extensions = project.syncExtensions ? { ...project.syncExtensions } : {}
  const previousPc = extensions['com.luna.pc']
  const pcExtensions = previousPc && typeof previousPc === 'object' && !Array.isArray(previousPc)
    ? previousPc as Record<string, unknown> : {}
  return {
    schema: 'luna-edit-project-v1',
    id: project.id,
    name: project.name,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    director_plan_id: project.directorPlanId,
    canvas: { ...project.canvas },
    media: project.sources.map(wireMedia),
    clips: project.clips.map(clip => ({
      id: clip.id,
      source_id: clip.sourceId,
      source_start_ms: clip.sourceStartMs,
      source_end_ms: clip.sourceEndMs,
      timeline_start_ms: clip.timelineStartMs,
      volume: clip.volume,
      ...(clip.color ? { color: { ...clip.color } } : {}),
      ...(clip.crop ? { crop: { ...clip.crop } } : {}),
      ...(clip.photoMotion ? { photo_motion: clip.photoMotion } : {}),
      ...(clip.speedCurve ? { speed_curve: {
        interpolation: clip.speedCurve.interpolation,
        points: clip.speedCurve.points.map(point => ({ ...point })),
      } } : {}),
      ...(clip.fadeOutMs !== undefined ? { fade_out_ms: clip.fadeOutMs } : {}),
    })),
    music: project.music ? {
      source_id: project.music.sourceId,
      source_start_ms: project.music.sourceStartMs,
      source_end_ms: project.music.sourceEndMs,
      timeline_start_ms: 0,
      volume: project.music.volume,
      ...(project.music.timing ? { timing: {
        bpm: project.music.timing.bpm,
        duration: project.music.timing.duration,
        beat_times: [...project.music.timing.beatTimes],
        downbeats: [...project.music.timing.downbeats],
        percussion_hits: project.music.timing.percussionHits.map(hit => ({ ...hit })),
      } } : {}),
    } : null,
    look: {
      filter: project.filter ? { ...project.filter } : null,
      watermark: project.watermark ? JSON.parse(JSON.stringify(project.watermark)) as Record<string, unknown> : null,
    },
    extensions: {
      ...extensions,
      'com.luna.pc': { ...pcExtensions, music_enabled: project.musicEnabled !== false },
    },
  }
}
