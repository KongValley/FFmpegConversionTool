import { PRESETS } from './presets'
import type {
  AdvancedOptions,
  EncodeOptions,
  PresetId,
  Resolution,
  Settings,
  WindowState
} from './types'

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

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function numIn(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function numOrNull(value: unknown, min: number): number | null {
  const n = Number(value)
  return value === null || value === undefined || !Number.isFinite(n) || n < min ? null : n
}

function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function strOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

/**
 * 只消毒高级参数。presetId 由调用方给出：上传兼容只对 MP4 (H.264) 有意义，
 * 让 advanced 自己带一份 presetId 会和顶层设置互相打架。
 */
export function sanitizeAdvanced(raw: unknown, presetId: PresetId = DEFAULT_SETTINGS.presetId): AdvancedOptions {
  const o = (raw ?? {}) as Partial<AdvancedOptions>
  return {
    rateMode: pick(o.rateMode, ['quality', 'bitrate'] as const, DEFAULT_ADVANCED.rateMode),
    videoBitrateKbps: numIn(o.videoBitrateKbps, DEFAULT_ADVANCED.videoBitrateKbps, 100, 100_000),
    resolution:
      typeof o.resolution === 'string' &&
      (/^\d+x\d+$/.test(o.resolution) || ['source', '2160p', '1080p', '720p', '480p'].includes(o.resolution))
        ? (o.resolution as Resolution)
        : 'source',
    fps: numOrNull(o.fps, 1),
    audioCodec: pick(o.audioCodec, ['auto', 'aac', 'libmp3lame', 'libopus', 'copy'] as const, 'auto'),
    audioBitrateKbps: numIn(o.audioBitrateKbps, DEFAULT_ADVANCED.audioBitrateKbps, 32, 512),
    channels: pick(o.channels, ['source', '2', '1'] as const, 'source'),
    sampleRate: numOrNull(o.sampleRate, 8000),
    extraArgs: strOf(o.extraArgs, ''),
    hwaccel: boolOf(o.hwaccel, false),
    videoCopy: boolOf(o.videoCopy, false),
    uploadCompat: boolOf(o.uploadCompat, false) && presetId === 'mp4-h264',
    imageMode: pick(o.imageMode, ['single', 'sequence'] as const, 'single'),
    imageTimeSec: numIn(o.imageTimeSec, DEFAULT_ADVANCED.imageTimeSec, 0, 86_400),
    imageIntervalSec: numIn(o.imageIntervalSec, DEFAULT_ADVANCED.imageIntervalSec, 1, 3600),
    trimStartSec: numOrNull(o.trimStartSec, 0),
    trimEndSec: numOrNull(o.trimEndSec, 0),
    crop: typeof o.crop === 'string' && (o.crop === '' || /^\d+:\d+:\d+:\d+$/.test(o.crop)) ? o.crop : '',
    rotate: [0, 90, 180, 270].includes(Number(o.rotate)) ? (Number(o.rotate) as 0 | 90 | 180 | 270) : 0,
    normalizeAudio: boolOf(o.normalizeAudio, false)
  }
}

/** 任意来源的编码参数（落盘队列、IPC 入参）统一消毒，非法值逐项回落默认 */
export function sanitizeEncodeOptions(
  raw: unknown,
  presetFallback: PresetId = DEFAULT_SETTINGS.presetId
): EncodeOptions {
  const o = (raw ?? {}) as Partial<AdvancedOptions> & Partial<EncodeOptions>
  const presetId = pick(o.presetId, PRESET_IDS, presetFallback)
  return {
    presetId,
    quality: pick(o.quality, ['high', 'medium', 'low'] as const, DEFAULT_SETTINGS.quality),
    accel: pick(o.accel, ['auto', 'cpu'] as const, DEFAULT_SETTINGS.accel),
    ...sanitizeAdvanced(o, presetId)
  }
}

/** 手改 settings.json 也限制在 1–4，非法值回落 1 */
function clampParallel(value: unknown): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 1
}

/** 窗口尺寸四个字段必须都是有限数字，否则整块丢弃 */
function sanitizeWindow(value: unknown): WindowState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<WindowState>
  const numbers = [raw.width, raw.height, raw.x, raw.y]
  if (numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
  return { width: raw.width as number, height: raw.height as number, x: raw.x as number, y: raw.y as number }
}

/**
 * 磁盘上的设置可能缺字段、类型不对甚至被手改坏（旧版本或手工编辑），逐字段消毒后返回。
 * 任何非法值都回落默认，绝不让坏设置把运行期炸掉。
 */
export function mergeSettings(parsed: Partial<Settings> | null): Settings {
  const raw = (parsed ?? {}) as Partial<Settings>
  const outputDir =
    typeof raw.outputDir === 'string' && raw.outputDir.trim() !== '' ? raw.outputDir : null
  // 自定义目录缺失时退回同源目录模式，避免运行期到处判空
  const outputMode = pick(raw.outputMode, ['source', 'custom'] as const, 'source') === 'custom' && outputDir
    ? 'custom'
    : 'source'
  const presetId = pick(raw.presetId, PRESET_IDS, DEFAULT_SETTINGS.presetId)
  return {
    outputMode,
    outputDir,
    accel: pick(raw.accel, ['auto', 'cpu'] as const, DEFAULT_SETTINGS.accel),
    presetId,
    quality: pick(raw.quality, ['high', 'medium', 'low'] as const, DEFAULT_SETTINGS.quality),
    advanced: sanitizeAdvanced(raw.advanced, presetId),
    window: sanitizeWindow(raw.window),
    parallel: clampParallel(raw.parallel)
  }
}
