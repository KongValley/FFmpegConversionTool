import type { PresetId } from './types'

export type VideoCodec = 'h264' | 'h265' | 'av1' | 'vp9'
export type NvencEncoder = 'h264_nvenc' | 'hevc_nvenc' | 'av1_nvenc'
export type AudioEncoder = 'aac' | 'libmp3lame' | 'libopus' | 'flac' | 'pcm_s16le'

export interface PresetDef {
  id: PresetId
  label: string
  ext: string
  kind: 'video' | 'audio' | 'gif'
  videoCodec: VideoCodec | null
  nvenc: NvencEncoder | null
  audioCodec: AudioEncoder | null
}

export const PRESETS: Record<PresetId, PresetDef> = {
  'mp4-h264': {
    id: 'mp4-h264',
    label: 'MP4 (H.264)',
    ext: 'mp4',
    kind: 'video',
    videoCodec: 'h264',
    nvenc: 'h264_nvenc',
    audioCodec: 'aac'
  },
  'mp4-h265': {
    id: 'mp4-h265',
    label: 'MP4 (H.265)',
    ext: 'mp4',
    kind: 'video',
    videoCodec: 'h265',
    nvenc: 'hevc_nvenc',
    audioCodec: 'aac'
  },
  'mp4-av1': {
    id: 'mp4-av1',
    label: 'MP4 (AV1)',
    ext: 'mp4',
    kind: 'video',
    videoCodec: 'av1',
    nvenc: 'av1_nvenc',
    audioCodec: 'aac'
  },
  'webm-vp9': {
    id: 'webm-vp9',
    label: 'WebM (VP9)',
    ext: 'webm',
    kind: 'video',
    videoCodec: 'vp9',
    nvenc: null,
    audioCodec: 'libopus'
  },
  'mkv-h265': {
    id: 'mkv-h265',
    label: 'MKV (H.265)',
    ext: 'mkv',
    kind: 'video',
    videoCodec: 'h265',
    nvenc: 'hevc_nvenc',
    audioCodec: 'aac'
  },
  mp3: {
    id: 'mp3',
    label: 'MP3',
    ext: 'mp3',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'libmp3lame'
  },
  m4a: {
    id: 'm4a',
    label: 'M4A (AAC)',
    ext: 'm4a',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'aac'
  },
  wav: {
    id: 'wav',
    label: 'WAV',
    ext: 'wav',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'pcm_s16le'
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    ext: 'flac',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'flac'
  },
  gif: {
    id: 'gif',
    label: 'GIF',
    ext: 'gif',
    kind: 'gif',
    videoCodec: null,
    nvenc: null,
    audioCodec: null
  }
}

export const PRESET_LIST: PresetDef[] = Object.values(PRESETS)

export const PRESET_GROUPS: { label: string; presets: PresetDef[] }[] = [
  { label: '视频', presets: PRESET_LIST.filter((p) => p.kind === 'video') },
  { label: '音频', presets: PRESET_LIST.filter((p) => p.kind === 'audio') },
  { label: '动图', presets: PRESET_LIST.filter((p) => p.kind === 'gif') }
]
