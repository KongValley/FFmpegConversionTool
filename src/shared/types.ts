export type PresetId =
  | 'mp4-h264'
  | 'mp4-h265'
  | 'mp4-av1'
  | 'webm-vp9'
  | 'mkv-h265'
  | 'mkv-h264'
  | 'mov-h264'
  | 'mp3'
  | 'm4a'
  | 'wav'
  | 'flac'
  | 'ogg-opus'
  | 'aac'
  | 'audio-copy'
  | 'gif'
  | 'png'
  | 'jpg'

export type Quality = 'high' | 'medium' | 'low'
export type AccelMode = 'auto' | 'cpu'
export type RateMode = 'quality' | 'bitrate'
export type Resolution = 'source' | '2160p' | '1080p' | '720p' | '480p' | `${number}x${number}`
export type NvencSupport = { h264: boolean; hevc: boolean; av1: boolean }

export interface EncodeOptions {
  presetId: PresetId
  quality: Quality
  accel: AccelMode
  rateMode: RateMode
  videoBitrateKbps: number
  resolution: Resolution
  fps: number | null
  audioCodec: 'auto' | 'aac' | 'libmp3lame' | 'libopus'
  audioBitrateKbps: number
  channels: 'source' | '2' | '1'
  sampleRate: number | null
  extraArgs: string
  hwaccel: boolean
  videoCopy: boolean
  imageMode: 'single' | 'sequence'
  imageTimeSec: number
  imageIntervalSec: number
  trimStartSec: number | null
  trimEndSec: number | null
  crop: string
  rotate: 0 | 90 | 180 | 270
  normalizeAudio: boolean
}

export interface MediaInfo {
  durationMs: number | null
  format: string
  hasVideo: boolean
  hasAudio: boolean
  video?: { codec: string; width: number; height: number; fps: number | null; bitrateKbps: number | null }
  audio?: { codec: string; sampleRate: number; channels: number; bitrateKbps: number | null }
}

export interface JobProgress {
  percent: number | null
  outTimeMs: number
  speed: string | null
  fps: number | null
  etaSec: number | null
  sizeBytes: number | null
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface Job {
  id: string
  inputPath: string
  outputPath: string
  options: EncodeOptions
  media: MediaInfo | null
  status: JobStatus
  progress: JobProgress
  usedGpu: boolean
  fallbackNote: string | null
  error: string | null
  /** 无损合并任务的输入文件列表，普通任务为 null */
  mergeInputs: string[] | null
}

export interface AdvancedOptions {
  rateMode: RateMode
  videoBitrateKbps: number
  resolution: Resolution
  fps: number | null
  audioCodec: 'auto' | 'aac' | 'libmp3lame' | 'libopus'
  audioBitrateKbps: number
  channels: 'source' | '2' | '1'
  sampleRate: number | null
  extraArgs: string
  hwaccel: boolean
  videoCopy: boolean
  imageMode: 'single' | 'sequence'
  imageTimeSec: number
  imageIntervalSec: number
  trimStartSec: number | null
  trimEndSec: number | null
  crop: string
  rotate: 0 | 90 | 180 | 270
  normalizeAudio: boolean
}

export interface WindowState {
  width: number
  height: number
  x: number | null
  y: number | null
}

export interface Settings {
  outputMode: 'source' | 'custom'
  outputDir: string | null
  accel: AccelMode
  presetId: PresetId
  quality: Quality
  advanced: AdvancedOptions
  window: WindowState | null
}

export interface FfmpegState {
  status: 'missing' | 'installing' | 'ready' | 'error'
  version: string | null
  installProgress: number | null
  error: string | null
  nvenc: NvencSupport | null
}
