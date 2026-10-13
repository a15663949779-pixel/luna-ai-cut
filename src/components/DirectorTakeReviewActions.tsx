import { useState } from 'react'
import { Clock3, Heart, MessageCircle } from 'lucide-react'
import type { DirectorTakeReview } from '../shared/types/directorLab'
import { EMPTY_DIRECTOR_TAKE_REVIEW, validateDirectorTakeReview } from '../lib/directorTakeReview'
import { Button, Dialog, IconButton, Input, toast } from '../ui'
import './DirectorTakeReviewActions.css'

interface Props {
  review?: DirectorTakeReview
  video: boolean
  positionMs: number
  durationMs: number
  disabled: boolean
  onPause: () => void
  onSeek: (milliseconds: number) => void
  onSave: (review: DirectorTakeReview) => Promise<void>
}

export function DirectorTakeReviewActions({ review: rawReview, video, positionMs, durationMs, disabled, onPause, onSeek, onSave }: Props) {
  const review = rawReview ?? EMPTY_DIRECTOR_TAKE_REVIEW
  const [editing, setEditing] = useState<{ momentId: string | null; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const busy = disabled || saving
  const save = async (next: DirectorTakeReview) => {
    if (busy) return
    setSaving(true)
    try {
      await onSave(validateDirectorTakeReview({ ...next, updated_at: new Date().toISOString() }))
      setEditing(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }
  const currentMoment = () => review.moments.find(moment => Math.abs(moment.time_ms - positionMs) <= 250)
  const pointIsLiked = Boolean(currentMoment()?.liked)
  const toggleWholeLike = () => void save({ ...review, liked: !review.liked })
  const togglePointLike = () => {
    const time = Math.min(Math.max(0, Math.round(positionMs)), Math.max(0, durationMs))
    const current = currentMoment()
    const nextMoment = current
      ? { ...current, liked: !current.liked }
      : { id: crypto.randomUUID(), time_ms: time, liked: true, comment: '' }
    const moments = [...review.moments.filter(moment => moment.id !== nextMoment.id), nextMoment]
      .filter(moment => moment.liked || moment.comment.trim())
    void save({ ...review, moments })
  }
  const editComment = (momentId: string | null) => {
    onPause()
    const current = momentId === null ? null : review.moments.find(moment => moment.id === momentId)
    setEditing({ momentId, text: current?.comment ?? '' })
  }
  const commitComment = () => {
    if (!editing || busy) return
    if (!editing.text.trim()) {
      const current = editing.momentId === null
        ? review.comment
        : review.moments.find(moment => moment.id === editing.momentId)?.comment ?? ''
      if (!current.trim()) return
    }
    if (editing.momentId === null) {
      void save({ ...review, comment: editing.text })
      return
    }
    const existing = review.moments.find(moment => moment.id === editing.momentId)
    if (!existing) return
    const moments = review.moments
      .map(moment => moment.id === editing.momentId ? { ...moment, comment: editing.text } : moment)
      .filter(moment => moment.liked || moment.comment.trim())
    void save({ ...review, moments })
  }
  const editPointComment = () => {
    const time = Math.min(Math.max(0, Math.round(positionMs)), Math.max(0, durationMs))
    const current = currentMoment()
    if (current) editComment(current.id)
    else {
      onPause()
      setEditing({ momentId: `new:${time}`, text: '' })
    }
  }
  const commitPointComment = () => {
    if (!editing || busy || editing.momentId === null) return
    const [prefix, rawTime] = editing.momentId.startsWith('new:') ? ['new', editing.momentId.slice(4)] : ['', '']
    if (!prefix) return commitComment()
    if (!editing.text.trim()) return
    const time = Number(rawTime)
    void save({ ...review, moments: [...review.moments, {
      id: crypto.randomUUID(), time_ms: time, liked: false, comment: editing.text,
    }] })
  }

  const commentRows = [
    ...(review.comment.trim() ? [{ id: 'whole', label: '整段', text: review.comment, time_ms: null as number | null }] : []),
    ...review.moments.filter(moment => moment.comment.trim()).map(moment => ({
      id: moment.id, label: formatReviewTime(moment.time_ms), text: moment.comment, time_ms: moment.time_ms,
    })),
  ]
  const currentEditingComment = editing?.momentId === null
    ? review.comment
    : review.moments.find(moment => moment.id === editing?.momentId)?.comment ?? ''
  const cannotSaveEmptyComment = !editing?.text.trim() && !currentEditingComment.trim()

  return <>
    <div className="director-take-review-rail" aria-label="素材评论">
      <IconButton variant="light" size="compact" icon={<Heart size={18} fill={review.liked ? 'currentColor' : 'none'} />}
        aria-label="整段点赞" title="整段点赞" disabled={busy} className={review.liked ? 'is-active' : ''} onClick={toggleWholeLike} />
      <IconButton variant="light" size="compact" icon={<MessageCircle size={18} />}
        aria-label="整段评论" title="整段评论" disabled={busy} onClick={() => editComment(null)} />
      {video && <>
        <IconButton variant="light" size="compact" className={pointIsLiked ? 'is-active' : ''}
          icon={<span className="director-review-point-icon"><Heart size={18} fill={pointIsLiked ? 'currentColor' : 'none'} /><Clock3 size={10} /></span>}
          aria-label="时间点点赞" title="时间点点赞" disabled={busy || durationMs <= 0} onClick={togglePointLike} />
        <IconButton variant="light" size="compact" icon={<span className="director-review-point-icon"><MessageCircle size={18} /><Clock3 size={10} /></span>}
          aria-label="时间点评论" title="时间点评论" disabled={busy || durationMs <= 0} onClick={editPointComment} />
      </>}
    </div>
    {commentRows.length > 0 && <div className="director-take-review-comments" aria-label="已保存的评论">
      {commentRows.map(row => <button key={row.id} type="button" onClick={() => row.time_ms !== null && onSeek(row.time_ms)}
        disabled={row.time_ms === null}>
        <span>{row.label}</span><span>{row.text}</span>
      </button>)}
    </div>}
    <Dialog open={editing !== null} title={editing?.momentId === null ? '整段评论' : '时间点评论'} tone="dark"
      onOpenChange={open => !open && !saving && setEditing(null)} footer={<>
        <Button disabled={saving} onClick={() => setEditing(null)}>取消</Button>
        <Button variant="primary" disabled={busy || cannotSaveEmptyComment}
          onClick={editing?.momentId?.startsWith('new:') ? commitPointComment : commitComment}>{saving ? '保存中' : '保存'}</Button>
      </>}>
      <Input variant="pill" fullWidth autoFocus maxLength={1000} value={editing?.text ?? ''}
        placeholder="写下评论" disabled={busy} onChange={event => setEditing(current => current ? { ...current, text: event.target.value } : current)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); editing?.momentId?.startsWith('new:') ? commitPointComment() : commitComment() } }} />
    </Dialog>
  </>
}

function formatReviewTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
