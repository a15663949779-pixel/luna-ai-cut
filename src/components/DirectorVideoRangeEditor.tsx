import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { DirectorLanShot, DirectorLanTake } from '../shared/types'
import { Button, Dialog, LoadingIndicator } from '../ui'
import { DirectorShotInspector } from './DirectorShotInspector'
import { DirectorTakeReviewActions } from './DirectorTakeReviewActions'
import type { DirectorTakeReview } from '../shared/types/directorLab'
import { PreviewStage, type PreviewStageHandle } from './PreviewStage'
import { DirectorMovementReferencePreview } from './director-movement-reference/DirectorMovementReferencePreview'
import { TrimStrip } from '../workspace/trim/TrimStrip'
import { useTrimThumbnails } from '../workspace/trim/useTrimThumbnails'
import './DirectorVideoRangeEditor.css'
import './DirectorShotDetailDialog.css'

interface Props {
  take: DirectorLanTake
  shot: DirectorLanShot
  takes: DirectorLanTake[]
  source: () => Promise<string>
  onSaveReview: (review: DirectorTakeReview) => Promise<void>
  onSelectTake: (take: DirectorLanTake) => void
  onClose: () => void
  adding: boolean
  onAddMaterials: () => void
  phoneConnected: boolean
  onDeleteMaterial: (take: DirectorLanTake) => Promise<void>
}

export function DirectorVideoRangeEditor({ take, shot, takes, source, onSaveReview, onSelectTake, onClose, adding, onAddMaterials, phoneConnected, onDeleteMaterial }: Props) {
  const playable = take.available && Boolean(take.stream_url)
  const isVideo = take.kind === 'video' && playable
  const stage = useRef<PreviewStageHandle>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [media, setMedia] = useState({ currentTime: 0, duration: 0, playing: false })
  const sourceLoader = useRef(source)
  sourceLoader.current = source
  const takeSnapshot = useRef(take)
  takeSnapshot.current = take
  const desiredSeek = useRef<number | null>(null)
  const seekFrame = useRef<number | null>(null)
  const { thumbnails } = useTrimThumbnails({ videoPath: url, duration: media.duration })

  useEffect(() => {
    let cancelled = false
    const nextTake = takeSnapshot.current
    setUrl(null)
    setError(null)
    setMedia({ currentTime: 0, duration: 0, playing: false })
    if (seekFrame.current !== null) { cancelAnimationFrame(seekFrame.current); seekFrame.current = null }
    if (!nextTake.available || !nextTake.stream_url) return
    const timeout = window.setTimeout(() => {
      if (!cancelled) setError('素材读取超时，请检查本地文件或手机连接后重新打开。')
    }, 60_000)
    void sourceLoader.current().then(value => { if (!cancelled) setUrl(value) }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '素材读取失败')
    }).finally(() => window.clearTimeout(timeout))
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [take.id, take.stream_url, take.available])

  useEffect(() => {
    if (!url || !isVideo || media.duration > 0) return
    const timeout = window.setTimeout(() => setError('素材无法播放，请检查文件是否存在、是否损坏或格式是否受支持。'), 15_000)
    return () => window.clearTimeout(timeout)
  }, [url, media.duration, isVideo])

  const seek = useCallback((seconds: number) => {
    if (stage.current?.isPlaying()) stage.current.togglePlay()
    desiredSeek.current = seconds
    if (seekFrame.current !== null) return
    seekFrame.current = requestAnimationFrame(() => {
      seekFrame.current = null
      if (desiredSeek.current !== null) stage.current?.seek(desiredSeek.current)
    })
  }, [])

  useEffect(() => () => { if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current) }, [])

  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose() }} title={take.file_name}
      tone="dark" className="director-range-dialog" bodyClassName="director-range-body" closeOnMaskClick={false}>
      <div className="director-range-main">
      <div className={`director-range-preview${!playable ? ' lab-shot-empty-preview' : ''}`} tabIndex={0} aria-label="素材预览" onKeyDown={event => {
        if (!isVideo || media.duration <= 0 || event.ctrlKey || event.metaKey || event.altKey) return
        if (event.code === 'Space') { event.preventDefault(); stage.current?.togglePlay() }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); seek(Math.min(media.duration, Math.max(0, media.currentTime + (event.key === 'ArrowRight' ? 1 : -1) / 30)))
        }
      }}>
        {!playable ? <>
          {shot.movement_reference && <DirectorMovementReferencePreview
            reference={shot.movement_reference} showHint stage />}
          <Button variant="primary" icon={<Upload size={18} />} disabled={adding} onClick={onAddMaterials}>{adding ? '添加中' : '添加素材'}</Button>
          {!phoneConnected && <p role="status">手机未连接，且本地没有可用素材。请连接手机同步素材，或添加本地素材。</p>}
        </> : error ? <span role="alert">{error}</span> : !url ? <LoadingIndicator label="正在读取素材" />
          : <PreviewStage key={take.id} ref={stage} url={url} isLivePhoto={false} hideControls onPlayStateChange={setMedia} />}
        {playable && <DirectorTakeReviewActions review={take.review} video={take.kind === 'video'}
          positionMs={Math.round(media.currentTime * 1000)} durationMs={Math.round(media.duration * 1000)}
          disabled={adding} onPause={() => { if (stage.current?.isPlaying()) stage.current.togglePlay() }}
          onSeek={milliseconds => seek(milliseconds / 1000)} onSave={onSaveReview} />}
      </div>
      {isVideo && <div className="director-media-preview-timeline">
        <TrimStrip duration={media.duration} startTime={0} endTime={media.duration} selectionEnabled={false}
          currentTime={media.currentTime} playing={media.playing} thumbnails={thumbnails}
          onTogglePlay={() => stage.current?.togglePlay()} onSeek={seek} />
      </div>}
      </div>
      <DirectorShotInspector shot={shot} takes={takes} selectedId={take.id} disabled={adding}
        showMovementReference={playable} onAddMaterials={onAddMaterials}
        onDeleteMaterial={onDeleteMaterial}
        onSelect={selectedTake => { if (selectedTake.id !== take.id) onSelectTake(selectedTake) }} />
    </Dialog>
  </>
}
