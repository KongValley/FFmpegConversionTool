import type { PresetId } from './types'

export type VideoCodec = 'h264' | 'h265' | 'av1' | 'vp9'
export type NvencEncoder = 'h264_nvenc' | 'hevc_nvenc' | 'av1_nvenc'
export type AudioEncoder = 'aac' | 'libmp3lame' | 'libopus' | 'flac' | 'pcm_s16le'

export interface PresetDef {
  id: PresetId
  label: string
  ext: string
  kind: 'video' | 'audio' | 'gif' | 'image'
  videoCodec: VideoCodec | null
  nvenc: NvencEncoder | null
  audioCodec: AudioEncoder | null
  /** 原始音轨：-c:a copy，输出扩展名按源音频编码决定 */
  audioCopy?: boolean
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
  'mkv-h264': {
    id: 'mkv-h264',
    label: 'MKV (H.264)',
    ext: 'mkv',
    kind: 'video',
    videoCodec: 'h264',
    nvenc: 'h264_nvenc',
    audioCodec: 'aac'
  },
  'mov-h264': {
    id: 'mov-h264',
    label: 'MOV (H.264)',
    ext: 'mov',
    kind: 'video',
    videoCodec: 'h264',
    nvenc: 'h264_nvenc',
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
  'ogg-opus': {
    id: 'ogg-opus',
    label: 'OGG (Opus)',
    ext: 'ogg',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'libopus'
  },
  aac: {
    id: 'aac',
    label: 'AAC (.aac)',
    ext: 'aac',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: 'aac'
  },
  'audio-copy': {
    id: 'audio-copy',
    label: '原始音轨（不重编码）',
    ext: 'mka',
    kind: 'audio',
    videoCodec: null,
    nvenc: null,
    audioCodec: null,
    audioCopy: true
  },
  gif: {
    id: 'gif',
    label: 'GIF',
    ext: 'gif',
    kind: 'gif',
    videoCodec: null,
    nvenc: null,
    audioCodec: null
  },
  png: {
    id: 'png',
    label: 'PNG 图片',
    ext: 'png',
    kind: 'image',
    videoCodec: null,
    nvenc: null,
    audioCodec: null
  },
  jpg: {
    id: 'jpg',
    label: 'JPG 图片',
    ext: 'jpg',
    kind: 'image',
    videoCodec: null,
    nvenc: null,
    audioCodec: null
  }
}

export const PRESET_LIST: PresetDef[] = Object.values(PRESETS)

/** 上传兼容（云端/浏览器直连）钉死 MP4 容器 + H.264，只有 mp4-h264 预设满足 */
export function supportsUploadCompat(presetId: PresetId): boolean {
  return presetId === 'mp4-h264'
}

export const PRESET_GROUPS: { label: string; presets: PresetDef[] }[] = [
  { label: '视频', presets: PRESET_LIST.filter((p) => p.kind === 'video') },
  { label: '音频', presets: PRESET_LIST.filter((p) => p.kind === 'audio') },
  { label: '动图', presets: PRESET_LIST.filter((p) => p.kind === 'gif') },
  { label: '图片', presets: PRESET_LIST.filter((p) => p.kind === 'image') }
]

const AUDIO_COPY_EXT: Record<string, string> = {
  aac: 'm4a',
  mp3: 'mp3',
  opus: 'opus',
  vorbis: 'ogg',
  flac: 'flac',
  alac: 'm4a',
  pcm_s16le: 'wav',
  pcm_s24le: 'wav',
  pcm_s32le: 'wav',
  pcm_f32le: 'wav',
  ac3: 'ac3',
  eac3: 'eac3'
}

/** 原始音轨提取的输出扩展名：未知编码落到 Matroska 音频容器 */
export function audioCopyExt(audioCodec?: string): string {
  return (audioCodec && AUDIO_COPY_EXT[audioCodec]) || 'mka'
}
