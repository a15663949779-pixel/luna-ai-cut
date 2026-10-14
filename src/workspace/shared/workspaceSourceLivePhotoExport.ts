import type { PreviewLayer, VideoExportSettings } from '../../shared/types'
import { exportPreviewImage, exportPreviewVideo, resolveExportConfig } from '../../components/previewStageExport'

export function replaceLivePhotoSourceWithVideo(
  layers: PreviewLayer[],
  sourcePath: string,
  videoPath: string,
  duration: number,
  videoSourceKey: string,
): PreviewLayer[] {
  return layers.map((layer) => layer.filePath === sourcePath ? {
    ...layer,
    filePath: videoPath,
    isVideo: true,
    videoSourceKey,
    videoTime: 0,
    videoOffset: 0,
    videoDuration: duration,
  } : layer)
}

function replaceLivePhotoSourceWithImage(
  layers: PreviewLayer[],
  sourcePath: string,
  imagePath: string,
): PreviewLayer[] {
  return layers.map((layer) => layer.filePath === sourcePath ? {
    ...layer,
    filePath: imagePath,
    isVideo: false,
    videoTime: undefined,
    videoOffset: undefined,
    videoDuration: undefined,
    videoSourceKey: undefined,
  } : layer)
}

function joinPath(directory: string, fileName: string): string {
  return `${directory.replace(/[\\/]$/, '')}/${fileName}`
}

export async function exportWorkspaceLivePhotoSource(params: {
  sourcePath: string
  livePhotoSourcePath: string
  layers: PreviewLayer[]
  outputSize: { width: number; height: number }
  exportDir: string
  outputFileName: string
  stamp: number
  config: VideoExportSettings
  onVideoProgress?: (percent: number, renderTaskId: string) => void | Promise<void>
}): Promise<{ path: string; name: string }> {
  const sourceVideo = await window.luna.previewLivePhoto(params.livePhotoSourcePath)
  if (sourceVideo.kind !== 'video' || !sourceVideo.cachedPath) {
    throw new Error(sourceVideo.message || '没有在 Live 图中找到视频片段')
  }
  const videoPath = sourceVideo.cachedPath
  const duration = await window.luna.workspace.getVideoDuration(videoPath)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取 Live 图视频时长')

  const resolved = resolveExportConfig(params.config, params.outputSize.width, params.outputSize.height)
  const videoLayers = replaceLivePhotoSourceWithVideo(
    params.layers,
    params.sourcePath,
    videoPath,
    duration,
    `live-photo-${params.outputFileName}`,
  )
  if (!videoLayers.some((layer) => layer.isVideo && layer.filePath === videoPath)) {
    throw new Error('无法处理 Live 图视频')
  }
  const imageLayers = params.livePhotoSourcePath === params.sourcePath
    ? replaceLivePhotoSourceWithImage(
        params.layers,
        params.sourcePath,
        await window.luna.extractLivePhotoImage(params.livePhotoSourcePath),
      )
    : params.layers

  const outputBaseName = params.outputFileName.replace(/\.[^.]+$/, '')
  const tempPrefix = `.${outputBaseName}_${params.stamp}_live`
  const tempImageName = `${tempPrefix}.jpg`
  const tempVideoName = `${tempPrefix}.mp4`
  const tempImagePath = joinPath(params.exportDir, tempImageName)
  const tempVideoPath = joinPath(params.exportDir, tempVideoName)
  const renderTaskId = `mixed_live_photo_${outputBaseName}_${params.stamp}`

  try {
    await exportPreviewImage({
      exportDir: params.exportDir,
      fileName: tempImageName,
      width: resolved.width,
      height: resolved.height,
      layers: imageLayers,
      format: 'jpeg',
      quality: 100,
    })
    await exportPreviewVideo({
      exportDir: params.exportDir,
      fileName: tempVideoName,
      width: resolved.width,
      height: resolved.height,
      layers: videoLayers,
      fps: resolved.fps,
      qualityPreset: resolved.qualityPreset ?? 'high',
      includeAudio: resolved.includeAudio,
      renderTaskId,
      onProgress: (percent) => params.onVideoProgress?.(percent, renderTaskId),
    })

    return await window.luna.workspace.exportRenderedLivePhoto(
      params.outputFileName,
      tempImagePath,
      tempVideoPath,
      false,
      false,
      false,
      Math.min(duration, 1.5),
      params.exportDir,
    )
  } finally {
    await window.luna.deleteLocalFiles([tempImagePath, tempVideoPath]).catch(() => {})
  }
}
