import type { DirectorLanShot, DirectorLanTake } from '../shared/types'
import { normalizeDirectorShotFields } from './directorShotFields'

export function buildDirectorShotCopyText(shot: DirectorLanShot): string {
  const fields = normalizeDirectorShotFields(shot)
  const lines = [
    `镜头 ${shot.order}：${shot.name}`,
    `镜头 ID：${shot.id}`,
    `建议时长：${formatSeconds(shot.duration_ms)} 秒`,
    '',
    '镜头描述：',
    ...fields.attributes.map(field => `- ${field.name}：${field.description}`),
  ]

  if (fields.remark) lines.push(`- 备注：${fields.remark}`)
  appendDescription(lines, '动作指导', shot.action_guidance)
  appendDescription(lines, '字幕', shot.subtitle)
  const attributeDescriptions = fields.attributes.map(field => field.description.trim())
  appendDescription(lines, '视觉描述', shot.visual_description, attributeDescriptions)
  appendDescription(lines, '运镜描述', shot.movement_description, attributeDescriptions)
  appendDescription(lines, '构图参考', shot.movement_reference?.hint)

  lines.push('', `素材与标注（${shot.takes.length} 条）：`)
  if (shot.takes.length === 0) lines.push('- 暂无素材')
  shot.takes.forEach((take, index) => appendTake(lines, take, index))
  return lines.join('\n')
}

function appendDescription(lines: string[], label: string, value: string | null | undefined, knownValues: string[] = []): void {
  const description = value?.trim()
  if (description && !knownValues.includes(description)) lines.push(`- ${label}：${description}`)
}

function appendTake(lines: string[], take: DirectorLanTake, index: number): void {
  lines.push('', `${index + 1}. ${take.file_name}（${take.kind === 'video' ? '视频' : '照片'}）`)
  lines.push(`- 素材 ID：${take.id}`)
  lines.push(`- 可用：${take.available ? '是' : '否'}`)
  appendValue(lines, '文件路径', take.stream_path ?? take.download_path ?? '未提供')
  appendValue(lines, '素材路径', take.stream_path && take.download_path !== take.stream_path ? take.download_path : null)
  appendValue(lines, '相机原始路径', take.source_camera_path ?? '未提供')
  appendValue(lines, '拍摄时间', take.captured_at ?? take.created_at)
  appendValue(lines, '时长', take.duration_ms == null ? null : `${formatSeconds(take.duration_ms)} 秒`)
  appendValue(lines, '分辨率', take.width && take.height ? `${take.width} × ${take.height}` : null)
  appendValue(lines, '编码格式', take.codec)
  appendValue(lines, '文件大小', take.size_bytes == null ? null : `${take.size_bytes} 字节`)

  if (take.selected_range) {
    const range = `${formatSeconds(take.selected_range.start_ms)}–${formatSeconds(take.selected_range.end_ms)} 秒`
    appendValue(lines, '选段', take.selected_range.note ? `${range}（${take.selected_range.note}）` : range)
  }

  const review = take.review
  if (review) {
    lines.push(`- 整段点赞：${review.liked ? '是' : '否'}`)
    appendValue(lines, '整段评论', review.comment)
    const moments = review.moments.filter(moment => moment.liked || moment.comment.trim())
    if (moments.length > 0) {
      lines.push('- 时间点标注：')
      moments.forEach(moment => {
        const annotations = [moment.liked ? '喜欢' : '', moment.comment.trim()].filter(Boolean).join('；')
        lines.push(`  - ${formatClock(moment.time_ms)}：${annotations}`)
      })
    }
  } else lines.push('- 整段点赞：未标注')

  const markers = take.markers?.filter(marker => marker.text.trim()) ?? []
  if (markers.length > 0) {
    lines.push('- 片段标记：')
    markers.forEach(marker => {
      const end = marker.end_ms == null ? '结束未指定' : formatClock(marker.end_ms)
      lines.push(`  - ${formatClock(marker.start_ms)}–${end}：${marker.text.trim()}`)
    })
  }
}

function appendValue(lines: string[], label: string, value: string | number | null | undefined): void {
  if (value !== null && value !== undefined && String(value).trim()) lines.push(`- ${label}：${value}`)
}

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(2).replace(/\.?0+$/, '')
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const fraction = milliseconds % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(3, '0')}`
}
