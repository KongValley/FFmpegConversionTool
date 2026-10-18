import type { AdvancedOptions, Settings } from './types'

export const DEFAULT_ADVANCED: AdvancedOptions = {
  rateMode: 'quality',
  videoBitrateKbps: 5000,
  resolution: 'source',
  fps: null,
  audioCodec: 'auto',
  audioBitrateKbps: 192,
  channels: 'source',
  sampleRate: null,
  extraArgs: '',
  hwaccel: false,
  videoCopy: false,
  uploadCompat: false,
  imageMode: 'single',
  imageTimeSec: 1,
  imageIntervalSec: 1,
  trimStartSec: null,
  trimEndSec: null,
  crop: '',
  rotate: 0,
  normalizeAudio: false
}

export const DEFAULT_SETTINGS: Settings = {
  outputMode: 'source',
  outputDir: null,
  accel: 'auto',
  presetId: 'mp4-h264',
  quality: 'high',
  advanced: DEFAULT_ADVANCED,
  window: null,
  parallel: 1
}

/** 手改 settings.json 也限制在 1–4，非法值回落 1 */
function clampParallel(value: unknown): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 1
}

/** 磁盘上的设置可能缺字段（旧版本或手工编辑），统一补默认值 */
export function mergeSettings(parsed: Partial<Settings> | null): Settings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    advanced: { ...DEFAULT_ADVANCED, ...(parsed?.advanced ?? {}) },
    window: parsed?.window ?? null
  }
  return { ...merged, parallel: clampParallel(merged.parallel) }
}
