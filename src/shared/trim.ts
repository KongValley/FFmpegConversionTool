import type { EncodeOptions } from './types'

/** 按剪辑设置算出实际输出时长（毫秒）；源时长未知时返回 null（进度按不确定显示） */
export function effectiveDurationMs(sourceMs: number | null, o: EncodeOptions): number | null {
  if (sourceMs === null) return null
  const sourceSec = sourceMs / 1000
  const start = o.trimStartSec ?? 0
  const end = o.trimEndSec ?? sourceSec
  return Math.max(0, Math.round((Math.min(end, sourceSec) - start) * 1000))
}
