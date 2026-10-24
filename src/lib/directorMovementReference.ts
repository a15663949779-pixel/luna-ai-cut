import type { DirectorMovementReference } from '../shared/types/directorLab'

const MAX_REFERENCE_BYTES = 128 * 1024

export function normalizeDirectorMovementReference(value: unknown): DirectorMovementReference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const sceneHtml = record.scene_html
  const sceneCss = record.scene_css ?? ''
  const sceneScript = record.scene_script ?? ''
  const hint = record.hint
  const duration = record.duration_ms ?? 6000
  const aspectRatio = record.aspect_ratio ?? 16 / 9

  if (record.version !== 1
    || typeof sceneHtml !== 'string' || !sceneHtml.trim()
    || typeof sceneCss !== 'string'
    || typeof sceneScript !== 'string'
    || typeof hint !== 'string' || !hint.trim() || hint.length > 4000
    || new TextEncoder().encode(`${sceneHtml}${sceneCss}${sceneScript}${hint}`).length > MAX_REFERENCE_BYTES
    || typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration < 1000 || duration > 3600000
    || typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio) || aspectRatio < 0.2 || aspectRatio > 5) {
    return null
  }

  return {
    version: 1,
    scene_html: sceneHtml,
    scene_css: sceneCss,
    scene_script: sceneScript,
    hint,
    duration_ms: duration,
    aspect_ratio: aspectRatio,
  }
}
