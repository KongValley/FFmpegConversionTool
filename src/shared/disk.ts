import { PRESETS } from './presets'
import type { EncodeOptions, MediaInfo, Quality } from './types'

const QUALITY_MULTIPLIER: Record<Quality, number> = { high: 2.5, medium: 1.6, low: 1.1 }

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

/** 按码率×时长估算输出体积（字节）；时长未知、图片/GIF 预设返回 null 表示不估算 */
export function estimateOutputBytes(media: MediaInfo | null, options: EncodeOptions): number | null {
  const durationSec = media?.durationMs ? media.durationMs / 1000 : null
  if (!durationSec) return null
  const preset = PRESETS[options.presetId]
  if (preset.kind === 'image' || preset.kind === 'gif') return null
  const audioKbps = options.audioBitrateKbps
  const videoKbps =
    preset.kind === 'audio'
      ? 0
      : options.rateMode === 'bitrate'
        ? options.videoBitrateKbps
        : Math.max(media?.video?.bitrateKbps ?? 0, 2000) * QUALITY_MULTIPLIER[options.quality]
  return Math.round((videoKbps + audioKbps + 32) * durationSec * 125)
}

/** 剩余空间不足估算值的 1.1 倍时给出中文提示（用整数比较避免浮点误差） */
export function diskSpaceWarning(estimatedBytes: number, freeBytes: number): string | null {
  if (freeBytes * 10 >= estimatedBytes * 11) return null
  return `磁盘剩余空间可能不足（估算需要 ${formatBytes(estimatedBytes)}，可用 ${formatBytes(freeBytes)}）`
}
