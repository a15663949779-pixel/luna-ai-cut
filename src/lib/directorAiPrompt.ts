import type { DirectorLanPlanSummary } from '../shared/types'

export function buildDirectorAiPrompt(plan: DirectorLanPlanSummary): string {
  const directory = plan.local_directory
  if (!directory) throw new Error('请先下载到文件夹')
  const basePath = directory.replace(/[\\/]+$/, '')
  return [
    `拍摄计划：${plan.title}`,
    `计划 ID：${plan.id}`,
    `素材目录：${directory}`,
    '',
    '目录内容：',
    `- manifest.json：${basePath}/manifest.json（JSON 格式的计划与素材元数据，格式标识为 luna-director-plan-v1）。`,
    `- README.md：${basePath}/README.md（计划和镜头信息的可读摘要）。`,
    `- media/：${basePath}/media/（按镜头分文件夹保存的素材原文件）。`,
    '- 素材文件相对路径格式为 media/<两位镜头序号>_<镜头名>/<两位素材序号>_<原文件名>；原文件格式保留，不裁剪或转码。',
    '',
    'manifest.json 数据结构：',
    '- shots 是镜头数组；每个镜头包含 id、order、name、attributes、remark、action_guidance、subtitle、visual_description、duration_ms、shot_recipe、可选的 movement_reference 和 media 等字段。movement_reference 是手机提供的 HTML 构图演示，编辑镜头时应原样保留。',
    '- 每个镜头的 media 是素材数组，包含 id、file_name、type、location、source_camera_path、created_at、captured_at、duration_ms、width、height、codec、path、available、selected_range 和 review 等字段。',
    '- media.path 是相对素材目录的文件路径；path 为 null 或 available 为 false 表示本地素材不可用。',
    '- selected_range.start_ms/end_ms 使用毫秒，时间对应原素材时间轴；review 保存素材点赞、评论和原素材时间点的互动。',
    '- 素材技术信息包括类型、文件名、来源路径、创建和拍摄时间、时长、画面尺寸及编码格式；具体值以 manifest.json 为准。',
  ].join('\n')
}
