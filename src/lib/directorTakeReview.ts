import type { DirectorLanPlanSummary, DirectorTakeReview } from '../shared/types/directorLab'

export function validateDirectorTakeReview(value: unknown): DirectorTakeReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('素材评论无效')
  const review = value as Partial<DirectorTakeReview>
  if (typeof review.liked !== 'boolean' || typeof review.comment !== 'string'
    || review.comment.length > 4000 || !Array.isArray(review.moments) || review.moments.length > 200
    || (review.updated_at !== undefined && (typeof review.updated_at !== 'string' || !Number.isFinite(Date.parse(review.updated_at))))) {
    throw new Error('素材评论无效')
  }
  const ids = new Set<string>()
  const moments = review.moments.map(moment => {
    if (!moment || typeof moment.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(moment.id)
      || ids.has(moment.id) || !Number.isSafeInteger(moment.time_ms) || moment.time_ms < 0
      || typeof moment.liked !== 'boolean' || typeof moment.comment !== 'string' || moment.comment.length > 1000) {
      throw new Error('时间点评论无效')
    }
    ids.add(moment.id)
    return { id: moment.id, time_ms: moment.time_ms, liked: moment.liked, comment: moment.comment }
  }).sort((left, right) => left.time_ms - right.time_ms || left.id.localeCompare(right.id))
  return { liked: review.liked, comment: review.comment, ...(review.updated_at ? { updated_at: review.updated_at } : {}), moments }
}

export const EMPTY_DIRECTOR_TAKE_REVIEW: DirectorTakeReview = {
  liked: false,
  comment: '',
  moments: [],
}

export function directorTakeReviewsEqual(left: DirectorTakeReview | undefined, right: DirectorTakeReview): boolean {
  try { return JSON.stringify(validateDirectorTakeReview(left ?? EMPTY_DIRECTOR_TAKE_REVIEW)) === JSON.stringify(validateDirectorTakeReview(right)) }
  catch { return false }
}

export function directorPlanWithTakeReview(plan: DirectorLanPlanSummary, takeId: string, review: DirectorTakeReview): DirectorLanPlanSummary {
  let found = false
  const shots = plan.shots.map(shot => ({ ...shot, takes: shot.takes.map(take => {
    if (take.id !== takeId) return take
    found = true
    return { ...take, review: validateDirectorTakeReview(review) }
  }) }))
  if (!found) throw new Error('素材不属于当前计划')
  return { ...plan, shots }
}
