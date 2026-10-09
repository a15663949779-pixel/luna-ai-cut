import type { AiEditorLocalMedia } from '../shared/types/aiEditor'
import type { DirectorLanPlanSummary } from '../shared/types/directorLab'
import type { EditProjectClip, LunaEditProject } from '../shared/types/aiEditing'

export function isFootagePlan(plan: DirectorLanPlanSummary): boolean {
  if (plan.kind === 'footage') return true
  if (plan.kind === 'shooting') return false
  const clips = plan.rough_cut?.clips
  return Boolean(clips?.length && clips.every(clip => typeof clip.source_ref === 'string' && clip.source_ref.trim()))
}

export function roughCutClipCount(plan: DirectorLanPlanSummary): number {
  return plan.rough_cut?.clips.length ?? plan.completed_shot_count
}

export interface FootageTakeDownload {
  takeId: string
  fileName: string
  url: string
}

/** Resolves source takes in the same order as the App's editing migration. */
export function selectedFootageTakeIds(plan: DirectorLanPlanSummary): string[] {
  const selected = new Set<string>()
  const roughCut = plan.rough_cut
  if (roughCut?.clips.length) {
    for (const clip of roughCut.clips) {
      const shot = plan.shots.find(item => item.id === clip.shot_ref)
      if (!shot) continue
      const rangeKey = clip.clip_id
        ?? `${clip.shot_ref}:${doubleKey(clip.from_beat)}:${doubleKey(clip.to_beat)}`
      const takeId = plan.rough_cut_ranges?.[rangeKey]?.take_id
        ?? clip.source_ref
        ?? plan.rough_cut_takes?.[clip.shot_ref]
        ?? [...shot.takes].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]?.id
      if (takeId) selected.add(takeId)
    }
  } else {
    for (const shot of plan.shots) {
      const take = [...shot.takes]
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
      if (take) selected.add(take.id)
    }
  }
  return [...selected]
}

/** Returns only the source takes referenced by the editing recipe. */
export function footageTakesToDownload(plan: DirectorLanPlanSummary): FootageTakeDownload[] {
  const selected = selectedFootageTakeIds(plan)

  const takes = plan.shots.flatMap(shot => shot.takes)
  return selected.flatMap(takeId => {
    const take = takes.find(item => item.id === takeId)
    if (!take?.available || !take.download_url) return []
    return [{ takeId, fileName: take.file_name, url: take.download_url }]
  })
}

function doubleKey(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value)
}

/** Converts the App's portable footage recipe into local PC timeline clips. */
export function seedFootageClips(
  plan: DirectorLanPlanSummary,
  media: AiEditorLocalMedia[],
  project: LunaEditProject,
): EditProjectClip[] {
  const roughCut = plan.rough_cut
  const mediaByTake = new Map<string, AiEditorLocalMedia>()
  for (const item of media) {
    for (const context of item.directorContexts ?? []) {
      if (context.planId === plan.id) mediaByTake.set(context.takeId, item)
    }
  }
  const recipes: NonNullable<DirectorLanPlanSummary['rough_cut']>['clips'] = roughCut && roughCut.clips.length > 0
    ? roughCut.clips
    : plan.shots.filter(shot => shot.takes.length > 0).map(shot => ({
        shot_ref: shot.id,
        from_beat: 0,
        to_beat: 0,
        source_anchor: 'center' as const,
      }))

  let timelineStartMs = 0
  const seeded: EditProjectClip[] = []
  for (const recipe of recipes) {
    const shot = plan.shots.find(item => item.id === recipe.shot_ref)
    if (!shot) continue
    const rangeKey = recipe.clip_id
      ?? `${recipe.shot_ref}:${doubleKey(recipe.from_beat)}:${doubleKey(recipe.to_beat)}`
    const range = plan.rough_cut_ranges?.[rangeKey]
    const takes = [...shot.takes].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    const takeId = range?.take_id
      ?? recipe.source_ref
      ?? plan.rough_cut_takes?.[recipe.shot_ref]
      ?? takes[0]?.id
    if (!takeId) continue
    const localMedia = mediaByTake.get(takeId)
    const source = localMedia
      ? project.sources.find(item => item.mediaId === localMedia.mediaId)
      : undefined
    if (!source || source.kind === 'audio' || source.available === false || !source.path) continue

    const selectedTake = takes.find(take => take.id === takeId)
    const image = source.kind === 'image'
    const bpm = plan.rough_cut_bpm ?? roughCut?.music?.score?.bpm
    const beatDurationMs = typeof bpm === 'number' && bpm > 0
      ? Math.round((recipe.to_beat - recipe.from_beat) * 60_000 / bpm)
      : null
    const explicitStart = range?.start_ms ?? recipe.source_start_ms ?? selectedTake?.selected_range?.start_ms
    const explicitEnd = range?.end_ms ?? recipe.source_end_ms ?? selectedTake?.selected_range?.end_ms
    const requestedDuration = explicitStart !== undefined && explicitEnd !== undefined && explicitEnd > explicitStart
      ? explicitEnd - explicitStart
      : beatDurationMs
        ?? (!roughCut?.clips.length && shot.duration_ms > 0 ? shot.duration_ms : null)
        ?? source.durationMs
        ?? (image ? 5000 : null)
    if (!requestedDuration || requestedDuration <= 0) continue

    const availableDuration = source.durationMs
      ?? (explicitEnd !== undefined
        ? explicitEnd
        : explicitStart !== undefined ? explicitStart + requestedDuration : null)
      ?? (image ? requestedDuration : null)
    if (!availableDuration || availableDuration <= 0) continue
    const durationMs = Math.min(requestedDuration, availableDuration)
    const startMs = image
      ? 0
      : explicitStart !== undefined
        ? explicitStart
        : recipe.source_anchor === 'end'
          ? availableDuration - durationMs
          : recipe.source_anchor === 'center'
            ? Math.floor((availableDuration - durationMs) / 2)
            : 0
    const boundedStartMs = Math.max(0, Math.min(startMs, availableDuration - durationMs))
    const endMs = boundedStartMs + durationMs
    if (endMs <= boundedStartMs) continue
    seeded.push({
      id: crypto.randomUUID(),
      sourceId: source.id,
      sourceStartMs: boundedStartMs,
      sourceEndMs: endMs,
      timelineStartMs,
      volume: 1,
      ...(image ? { photoMotion: 'gentleZoomIn' as const } : {}),
    })
    timelineStartMs += durationMs
  }
  return seeded
}
