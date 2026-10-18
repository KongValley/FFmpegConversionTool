import type { JobProgress } from './types'

/** 解析 ffmpeg -progress 输出的一行 key=value */
export function parseProgressLine(line: string): [string, string] | null {
  const idx = line.indexOf('=')
  if (idx <= 0) return null
  const key = line.slice(0, idx).trim()
  if (!key) return null
  return [key, line.slice(idx + 1).trim()]
}

export function progressFrom(
  outTimeUs: number,
  durationMs: number | null,
  speed: string | null
): JobProgress {
  const outTimeMs = Math.max(0, Math.round(outTimeUs / 1000))
  const known = durationMs !== null && durationMs > 0
  const rawPercent = known ? (outTimeMs / durationMs) * 100 : 0
  const percent = known ? Math.round(Math.min(100, Math.max(0, rawPercent)) * 10) / 10 : null
  const speedNum = speed ? Number.parseFloat(speed) : Number.NaN
  const etaSec =
    known && Number.isFinite(speedNum) && speedNum > 0
      ? Math.round(Math.max(0, ((durationMs - outTimeMs) / 1000 / speedNum) * 10)) / 10
      : null
  return { percent, outTimeMs, speed, fps: null, etaSec, sizeBytes: null }
}
