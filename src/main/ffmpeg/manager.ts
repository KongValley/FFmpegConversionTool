import { app, net } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { downloadAndExtract, type FfmpegPaths } from './download'
import { runCommand } from './exec'
import type { NvencSupport } from '../../shared/types'

let capabilityCache: NvencSupport | null = null
let capabilityPending: Promise<NvencSupport> | null = null

/** FFMPEG_DIR 环境变量优先，否则用 userData/bin/ffmpeg */
export function getPaths(): FfmpegPaths {
  const dir = process.env.FFMPEG_DIR ?? join(app.getPath('userData'), 'bin', 'ffmpeg')
  return { ffmpegPath: join(dir, 'ffmpeg.exe'), ffprobePath: join(dir, 'ffprobe.exe') }
}

export function isInstalled(): boolean {
  const { ffmpegPath, ffprobePath } = getPaths()
  return existsSync(ffmpegPath) && existsSync(ffprobePath)
}

const fetchViaElectron: typeof fetch = (input, init) =>
  net.fetch(input as string, init as RequestInit) as unknown as Promise<Response>

export async function ensureInstalled(
  onProgress?: (received: number, total: number | null) => void
): Promise<FfmpegPaths> {
  const paths = getPaths()
  if (existsSync(paths.ffmpegPath) && existsSync(paths.ffprobePath)) return paths
  if (process.env.FFMPEG_DIR) {
    throw new Error(`FFMPEG_DIR 指向的目录中缺少 ffmpeg.exe/ffprobe.exe：${process.env.FFMPEG_DIR}`)
  }
  const result = await downloadAndExtract({
    destDir: join(app.getPath('userData'), 'bin', 'ffmpeg'),
    workDir: join(app.getPath('userData'), 'bin'),
    fetchImpl: fetchViaElectron,
    zipPath: process.env.FFMPEG_ZIP_PATH ?? null,
    onProgress
  })
  const check = await runCommand(result.ffmpegPath, ['-version'], 20_000)
  if (check.code !== 0) throw new Error(`FFmpeg 无法运行：\n${check.stderr.slice(-500)}`)
  capabilityCache = null
  capabilityPending = null
  return result
}

/** 先看编译进的编码器，再用黑帧实机验证 NVENC 是否真的可用 */
async function probeCapabilitiesOnce(): Promise<NvencSupport> {
  const { ffmpegPath } = getPaths()
  const support: NvencSupport = { h264: false, hevc: false, av1: false }
  const encoders = await runCommand(ffmpegPath, ['-hide_banner', '-encoders'], 20_000)
  if (encoders.code === 0) {
    support.h264 = encoders.stdout.includes('h264_nvenc')
    support.hevc = encoders.stdout.includes('hevc_nvenc')
    support.av1 = encoders.stdout.includes('av1_nvenc')
  }
  if (support.h264) {
    const probe = await runCommand(
      ffmpegPath,
      ['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
      20_000
    )
    if (probe.code !== 0) {
      support.h264 = false
      support.hevc = false
      support.av1 = false
    }
  }
  capabilityCache = support
  return support
}

/** 并行批次会在同一轮事件循环里同时请求探测，共享进行中的 promise，避免重复跑黑帧 NVENC 探测 */
export function probeCapabilities(): Promise<NvencSupport> {
  if (capabilityCache) return Promise.resolve(capabilityCache)
  capabilityPending ??= probeCapabilitiesOnce().finally(() => {
    capabilityPending = null
  })
  return capabilityPending
}

export async function getVersion(): Promise<string | null> {
  const { ffmpegPath } = getPaths()
  const result = await runCommand(ffmpegPath, ['-version'], 20_000)
  if (result.code !== 0) return null
  const match = /^ffmpeg version (\S+)/.exec(result.stdout.split('\n')[0] ?? '')
  return match ? match[1] : null
}
