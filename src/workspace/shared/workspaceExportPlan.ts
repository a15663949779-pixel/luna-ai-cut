import type { WorkspaceMediaAsset, WorkspaceProjectAsset } from '../../shared/types'
import { isVideoPath } from '../../lib/fileUtils'
import { activeRemovalOperation, latestReadyRemovalOperation } from '../removal/removalOperations'
import { buildVideoOutputExportItems, findInvalidVideoOutputMarker } from '../trim/videoOutputMarkers'
import { mergePipeline, type EditPipeline } from './editPipeline'
import { outputSizeForTransform } from './renderLayerPipeline'
import { buildWorkspaceExportLayers } from './workspaceExportLayers'
import type { WorkspaceMixedExportPlanItem } from './workspaceMixedExport'
import { logger } from '../../lib/rendererLogger'

export function workspaceProjectSourcePath(asset: WorkspaceProjectAsset | undefined): string | undefined {
  if (!asset) return undefined
  return latestReadyRemovalOperation(asset.removal?.operations ?? [])?.resultPath ?? asset.path
}

export async function buildWorkspaceMixedExportPlan(params: {
  assets: WorkspaceMediaAsset[]
  projectAssets?: WorkspaceProjectAsset[]
  exportIndices: number[]
  getPipeline: (asset: WorkspaceMediaAsset, index: number) => EditPipeline
}): Promise<WorkspaceMixedExportPlanItem[]> {
  const sourceGroups = await Promise.all(params.exportIndices.map(async (index): Promise<WorkspaceMixedExportPlanItem[]> => {
    const asset = params.assets[index]
    const projectAsset = params.projectAssets?.[index]
    const activeRemoval = activeRemovalOperation(projectAsset?.removal?.operations ?? [])
    if (activeRemoval?.status === 'needs-regeneration') throw new Error(`${asset.name} 的消除结果需要重新生成`)

    const sourcePath = workspaceProjectSourcePath(projectAsset) ?? asset.path
    const pipeline = params.getPipeline(asset, index)
    const resolution = await window.luna.workspace.getMediaResolution(sourcePath)
    const sourceDuration = isVideoPath(asset.path)
      ? await window.luna.workspace.getVideoDuration(asset.path).catch(() => 0)
      : 0
    if (isVideoPath(asset.path) && sourceDuration <= 0) {
      throw new Error(`无法读取 ${asset.name} 的视频时长`)
    }

    const trimStart = pipeline.trim?.startTime ?? 0
    const trimEnd = pipeline.trim?.endTime ?? sourceDuration
    const outputBaseName = asset.name.replace(/\.[^.]+$/, '') || 'export'
    const borderMeta = pipeline.border?.enabled
      ? await window.luna.getMediaMetadataByPath(asset.path).catch(() => null)
      : null
    const untrimmedPipeline = isVideoPath(asset.path) ? mergePipeline(pipeline, { trim: null }) : pipeline
    const layers = buildWorkspaceExportLayers(sourcePath, resolution, untrimmedPipeline, borderMeta, true, projectAsset?.subtitles, asset)
    const outputSize = outputSizeForTransform(resolution, untrimmedPipeline.transform)
    logger.info('[导出诊断] 工作台尺寸参数', {
      assetPath: asset.path,
      sourcePath,
      sourceResolution: resolution,
      outputSize,
      resolutionSetting: '待导出弹窗选择',
      transform: {
        orientation: untrimmedPipeline.transform.orientation,
        crop: untrimmedPipeline.transform.crop,
      },
    })

    if (!isVideoPath(asset.path)) {
      const isLivePhoto = asset.isLivePhoto ?? await window.luna.workspace.isLivePhoto(asset.path).catch(() => false)
      return [{
        id: `${asset.id}-image`,
        kind: 'photo',
        sourcePath,
        outputBaseName,
        layers,
        outputSize,
        isLivePhoto,
        livePhotoSourcePath: asset.path,
      }]
    }

    const invalidMarker = findInvalidVideoOutputMarker(pipeline.outputMarkers, sourceDuration)
    if (invalidMarker) {
      throw new Error(`${asset.name} 的第 ${invalidMarker.index + 1} 个${invalidMarker.label}无效：${invalidMarker.reason}`)
    }
    const markerItems = buildVideoOutputExportItems(outputBaseName, pipeline.outputMarkers, sourceDuration)
    if (markerItems.length !== pipeline.outputMarkers.length) {
      throw new Error(`${asset.name} 有无效的导出标记，请调整后再导出`)
    }

    const normalizedTrimStart = Math.max(0, Math.min(trimStart, Math.max(0, sourceDuration - 0.1)))
    const normalizedTrimEnd = Math.max(
      normalizedTrimStart + Math.min(0.1, sourceDuration - normalizedTrimStart),
      Math.min(trimEnd, sourceDuration),
    )
    const videoMarkerItems = markerItems.filter((item) => item.kind === 'video')
    const videoItems: WorkspaceMixedExportPlanItem[] = videoMarkerItems.length > 0
      ? videoMarkerItems.map((item) => ({
          id: `${asset.id}-${item.markerId}`,
          kind: 'video',
          sourcePath,
          outputBaseName: item.outputBaseName,
          layers,
          outputSize,
          sourceDuration,
          startTime: item.startTime,
          endTime: item.endTime,
        }))
      : [{
          id: `${asset.id}-video`,
          kind: 'video',
          sourcePath,
          outputBaseName,
          layers,
          outputSize,
          sourceDuration,
          startTime: normalizedTrimStart,
          endTime: normalizedTrimEnd,
        }]

    const markedItems: WorkspaceMixedExportPlanItem[] = markerItems
      .filter((item) => item.kind !== 'video')
      .map((item) => item.kind === 'photo' ? {
        id: `${asset.id}-${item.markerId}`,
        kind: 'photo',
        sourcePath,
        outputBaseName: item.outputBaseName,
        layers,
        outputSize,
        sourceDuration,
        time: item.time,
      } : {
        id: `${asset.id}-${item.markerId}`,
        kind: 'live',
        sourcePath,
        outputBaseName: item.outputBaseName,
        layers,
        outputSize,
        sourceDuration,
        startTime: item.startTime,
        endTime: item.endTime,
        coverTime: item.coverTime,
      })
    return [...videoItems, ...markedItems]
  }))

  return sourceGroups.flat()
}
