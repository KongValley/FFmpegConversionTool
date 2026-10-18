import type { EncodeOptions, NvencSupport, Resolution } from './types'
import { PRESETS, type PresetDef, type VideoCodec } from './presets'

const CPU_ENCODER: Record<VideoCodec, string> = {
  h264: 'libx264',
  h265: 'libx265',
  av1: 'libsvtav1',
  vp9: 'libvpx-vp9'
}

interface QualityArgs {
  high: string[]
  medium: string[]
  low: string[]
}

/** 各编码器质量模式的完整参数（quality → high|medium|low） */
const QUALITY_ARGS: Record<string, QualityArgs> = {
  libx264: {
    high: ['-preset', 'slow', '-crf', '18'],
    medium: ['-preset', 'medium', '-crf', '23'],
    low: ['-preset', 'faster', '-crf', '28']
  },
  libx265: {
    high: ['-preset', 'slow', '-crf', '20'],
    medium: ['-preset', 'medium', '-crf', '24'],
    low: ['-preset', 'faster', '-crf', '28']
  },
  libsvtav1: {
    high: ['-preset', '4', '-crf', '28'],
    medium: ['-preset', '6', '-crf', '32'],
    low: ['-preset', '8', '-crf', '36']
  },
  'libvpx-vp9': {
    high: ['-crf', '24', '-b:v', '0', '-row-mt', '1'],
    medium: ['-crf', '31', '-b:v', '0', '-row-mt', '1'],
    low: ['-crf', '36', '-b:v', '0', '-row-mt', '1']
  },
  h264_nvenc: {
    high: ['-rc', 'vbr', '-cq', '19', '-b:v', '0', '-preset', 'p6', '-tune', 'hq'],
    medium: ['-rc', 'vbr', '-cq', '23', '-b:v', '0', '-preset', 'p5', '-tune', 'hq'],
    low: ['-rc', 'vbr', '-cq', '28', '-b:v', '0', '-preset', 'p4', '-tune', 'hq']
  },
  hevc_nvenc: {
    high: ['-rc', 'vbr', '-cq', '21', '-b:v', '0', '-preset', 'p6', '-tune', 'hq'],
    medium: ['-rc', 'vbr', '-cq', '25', '-b:v', '0', '-preset', 'p5', '-tune', 'hq'],
    low: ['-rc', 'vbr', '-cq', '29', '-b:v', '0', '-preset', 'p4', '-tune', 'hq']
  },
  av1_nvenc: {
    high: ['-rc', 'vbr', '-cq', '24', '-b:v', '0', '-preset', 'p6', '-tune', 'hq'],
    medium: ['-rc', 'vbr', '-cq', '28', '-b:v', '0', '-preset', 'p5', '-tune', 'hq'],
    low: ['-rc', 'vbr', '-cq', '32', '-b:v', '0', '-preset', 'p4', '-tune', 'hq']
  }
}

const IS_NVENC: Record<string, true> = { h264_nvenc: true, hevc_nvenc: true, av1_nvenc: true }
const NEEDS_AUDIO_BITRATE: Record<string, true> = { aac: true, libmp3lame: true, libopus: true }
const RESOLUTION_HEIGHTS: Record<string, number> = {
  '2160p': 2160,
  '1080p': 1080,
  '720p': 720,
  '480p': 480
}
const GIF_WIDTHS: Record<string, number> = {
  source: 480,
  '2160p': 3840,
  '1080p': 1920,
  '720p': 1280,
  '480p': 854
}

/** 额外参数按空白切分，不支持引号。导出的稳定契约，单测与 smoke 都依赖 */
export function splitExtraArgs(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

/** `宽x高` 形式的自定义分辨率，返回 null 表示非自定义 */
function customSize(resolution: Resolution): [number, number] | null {
  const match = /^(\d+)x(\d+)$/.exec(resolution)
  if (!match) return null
  return [Number(match[1]), Number(match[2])]
}

function resolveVideoEncoder(
  preset: PresetDef,
  o: EncodeOptions,
  nvenc: NvencSupport
): { name: string; gpu: boolean } {
  const codec = preset.videoCodec as VideoCodec
  if (o.accel === 'auto' && preset.nvenc) {
    const available =
      codec === 'h264' ? nvenc.h264 : codec === 'h265' ? nvenc.hevc : codec === 'av1' ? nvenc.av1 : false
    if (available) return { name: preset.nvenc, gpu: true }
  }
  return { name: CPU_ENCODER[codec], gpu: false }
}

function videoArgs(encoder: string, o: EncodeOptions): string[] {
  const args = ['-c:v', encoder]
  if (o.rateMode === 'bitrate') {
    if (IS_NVENC[encoder]) args.push('-rc', 'vbr')
    args.push('-b:v', `${o.videoBitrateKbps}k`)
    if (encoder === 'libvpx-vp9') args.push('-row-mt', '1')
  } else {
    args.push(...QUALITY_ARGS[encoder][o.quality])
  }
  return args
}

function videoFilterArgs(o: EncodeOptions): string[] {
  if (o.resolution === 'source') return []
  const size = customSize(o.resolution)
  const scale = size ? `scale=${size[0]}:${size[1]}` : `scale=-2:${RESOLUTION_HEIGHTS[o.resolution]}`
  return ['-vf', scale]
}

function audioArgs(preset: PresetDef, o: EncodeOptions): string[] {
  // 音频预设固定用预设编码器（避免 AAC 写进 .mp3）；视频预设允许在 aac/mp3/opus 间覆盖，
  // WebM 容器强制 Opus。
  const codec =
    preset.kind === 'audio' || o.audioCodec === 'auto'
      ? preset.audioCodec
      : preset.ext === 'webm'
        ? 'libopus'
        : o.audioCodec
  if (!codec) return []
  const args = ['-c:a', codec]
  if (NEEDS_AUDIO_BITRATE[codec]) args.push('-b:a', `${o.audioBitrateKbps}k`)
  if (o.channels !== 'source') args.push('-ac', o.channels)
  if (o.sampleRate !== null) args.push('-ar', String(o.sampleRate))
  return args
}

function containerArgs(preset: PresetDef): string[] {
  const args: string[] = []
  if (preset.ext === 'mp4' || preset.ext === 'm4a') args.push('-movflags', '+faststart')
  if (preset.ext === 'mp4' && preset.videoCodec === 'h265') args.push('-tag:v', 'hvc1')
  return args
}

export function buildFfmpegArgs(
  input: string,
  output: string,
  o: EncodeOptions,
  nvenc: NvencSupport
): { args: string[]; usedGpu: boolean } {
  const preset = PRESETS[o.presetId]
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'warning', '-progress', 'pipe:1', '-nostats', '-y']
  // -hwaccel 是输入选项，必须排在 -i 之前；音频与 GIF 预设保持纯 CPU
  if (o.hwaccel && preset.kind === 'video') args.push('-hwaccel', 'cuda')
  args.push('-i', input)
  let usedGpu = false

  if (preset.kind === 'gif') {
    const width = customSize(o.resolution)?.[0] ?? GIF_WIDTHS[o.resolution]
    args.push('-an', '-sn', '-dn')
    args.push(
      '-filter_complex',
      `[0:v] fps=15,scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,
      '-loop',
      '0'
    )
  } else {
    if (preset.kind === 'audio') {
      args.push('-map', '0:a:0?', '-vn', '-sn', '-dn')
    } else {
      args.push('-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn')
      const encoder = resolveVideoEncoder(preset, o, nvenc)
      usedGpu = encoder.gpu
      args.push(...videoArgs(encoder.name, o), '-pix_fmt', 'yuv420p')
      args.push(...videoFilterArgs(o))
      if (o.fps !== null && Number.isFinite(o.fps) && o.fps > 0) args.push('-r', String(o.fps))
    }
    args.push(...audioArgs(preset, o))
  }

  args.push(...containerArgs(preset), ...splitExtraArgs(o.extraArgs), output)
  return { args, usedGpu }
}
