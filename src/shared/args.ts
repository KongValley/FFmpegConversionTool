import type { EncodeOptions, NvencSupport, Resolution } from './types'
import { PRESETS, type PresetDef, type VideoCodec } from './presets'
import { isPlaylistPath } from './media'

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

/** 非 source 时的等比缩放表达式（宽高按自定义值精确缩放） */
function scaleExpression(resolution: Resolution): string | null {
  if (resolution === 'source') return null
  const size = customSize(resolution)
  return size ? `scale=${size[0]}:${size[1]}` : `scale=-2:${RESOLUTION_HEIGHTS[resolution]}`
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

function audioArgs(preset: PresetDef, o: EncodeOptions): string[] {
  if (preset.audioCopy) return ['-c:a', 'copy']
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

/** 容器相关参数按实际输出扩展名判断：原始音轨与图片序列的输出名是动态的 */
function containerArgs(preset: PresetDef, output: string): string[] {
  const dot = output.lastIndexOf('.')
  const outExt = dot === -1 ? '' : output.slice(dot + 1).toLowerCase()
  const args: string[] = []
  if (outExt === 'mp4' || outExt === 'm4a') args.push('-movflags', '+faststart')
  if (outExt === 'mp4' && preset.videoCodec === 'h265') args.push('-tag:v', 'hvc1')
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
  // 本地 m3u8 可能引用网络分片，必须放开协议白名单
  if (isPlaylistPath(input)) args.push('-protocol_whitelist', 'file,http,https,tcp,tls,crypto')
  // 单帧截图用输入级 -ss 快速定位
  if (preset.kind === 'image' && o.imageMode === 'single') {
    args.push('-ss', String(Math.max(0, o.imageTimeSec)))
  }
  // -hwaccel 是输入选项，必须排在 -i 之前；音频/GIF/图片与复制模式都用不到
  if (o.hwaccel && preset.kind === 'video' && !o.videoCopy) args.push('-hwaccel', 'cuda')
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
  } else if (preset.kind === 'image') {
    args.push('-map', '0:v:0?', '-an', '-sn', '-dn')
    const filters: string[] = []
    if (o.imageMode === 'sequence') filters.push(`fps=1/${Math.max(1, Math.round(o.imageIntervalSec))}`)
    const scale = scaleExpression(o.resolution)
    if (scale) filters.push(scale)
    if (filters.length > 0) args.push('-vf', filters.join(','))
    if (o.imageMode === 'single') args.push('-frames:v', '1', '-update', '1')
    if (preset.ext === 'jpg') args.push('-q:v', '2')
  } else {
    if (preset.kind === 'audio') {
      args.push('-map', '0:a:0?', '-vn', '-sn', '-dn')
    } else {
      args.push('-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn')
      if (o.videoCopy) {
        args.push('-c:v', 'copy')
      } else {
        const encoder = resolveVideoEncoder(preset, o, nvenc)
        usedGpu = encoder.gpu
        args.push(...videoArgs(encoder.name, o), '-pix_fmt', 'yuv420p')
        const scale = scaleExpression(o.resolution)
        if (scale) args.push('-vf', scale)
        if (o.fps !== null && Number.isFinite(o.fps) && o.fps > 0) args.push('-r', String(o.fps))
      }
    }
    args.push(...audioArgs(preset, o))
  }

  args.push(...containerArgs(preset, output), ...splitExtraArgs(o.extraArgs), output)
  return { args, usedGpu }
}
