import type { DirectorTakeMarker } from '../shared/types/directorLab'

export function validateDirectorTakeMarkers(value: unknown, durationMs?: number | null): DirectorTakeMarker[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('亮点标签无效，最多保存 200 个')
  const identifiers = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.id)
      || identifiers.has(item.id) || !Number.isSafeInteger(item.start_ms) || item.start_ms < 0
      || (item.end_ms != null && (!Number.isSafeInteger(item.end_ms) || item.end_ms <= item.start_ms))
      || (typeof durationMs === 'number' && durationMs > 0 && (item.end_ms ?? item.start_ms) > durationMs)
      || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 1000) throw new Error('亮点标签无效')
    identifiers.add(item.id)
    return { id: item.id, start_ms: item.start_ms, end_ms: item.end_ms ?? null, text: item.text.trim() }
  }).sort((left, right) => left.start_ms - right.start_ms || left.id.localeCompare(right.id))
}
