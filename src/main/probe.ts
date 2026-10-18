import { runCommand } from './ffmpeg/exec'
import type { MediaInfo } from '../shared/types'

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  bit_rate?: string
  sample_rate?: string
  channels?: number
  duration?: string
}

interface FfprobeFormat {
  format_name?: string
  duration?: string
  bit_rate?: string
}

const parseKbps = (value: string | undefined): number | null => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) : null
}

const parseFps = (value: string | undefined): number | null => {
  if (!value) return null
  const [num, den] = value.split('/').map(Number)
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return Math.round((num / den) * 100) / 100
}

export async function probeMedia(inputPath: string, ffprobePath: string): Promise<MediaInfo> {
  const result = await runCommand(
    ffprobePath,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
    30_000
  )
  if (result.code !== 0) throw new Error('无法识别的媒体文件')
  let parsed: { streams?: FfprobeStream[]; format?: FfprobeFormat }
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error('无法识别的媒体文件')
  }
  const streams = parsed.streams ?? []
  const format = parsed.format ?? {}
  const videoStream = streams.find((s) => s.codec_type === 'video')
  const audioStream = streams.find((s) => s.codec_type === 'audio')

  const durationSeconds = Number(format.duration ?? videoStream?.duration ?? audioStream?.duration)
  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null

  return {
    durationMs,
    format: format.format_name ?? '',
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream),
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? '',
          width: videoStream.width ?? 0,
          height: videoStream.height ?? 0,
          fps: parseFps(videoStream.avg_frame_rate),
          bitrateKbps: parseKbps(videoStream.bit_rate) ?? parseKbps(format.bit_rate)
        }
      : undefined,
    audio: audioStream
      ? {
          codec: audioStream.codec_name ?? '',
          sampleRate: Number(audioStream.sample_rate) || 0,
          channels: audioStream.channels ?? 0,
          bitrateKbps: parseKbps(audioStream.bit_rate)
        }
      : undefined
  }
}
