import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildFfmpegArgs } from '../src/shared/args'
import { downloadAndExtract } from '../src/main/ffmpeg/download'
import { runCommand } from '../src/main/ffmpeg/exec'
import type { EncodeOptions, NvencSupport } from '../src/shared/types'

const root = process.cwd()
const baseDir = join(root, 'tmp', 'smoke')
const binDir = process.env.FFMPEG_DIR ?? join(baseDir, 'ffmpeg')
const ffmpegPath = join(binDir, 'ffmpeg.exe')
const ffprobePath = join(binDir, 'ffprobe.exe')
const inputPath = join(baseDir, 'input.mp4')

const base: EncodeOptions = {
  presetId: 'mp4-h264',
  quality: 'high',
  accel: 'cpu',
  rateMode: 'quality',
  videoBitrateKbps: 5000,
  resolution: 'source',
  fps: null,
  audioCodec: 'auto',
  audioBitrateKbps: 192,
  channels: 'source',
  sampleRate: null,
  extraArgs: '',
  hwaccel: false
}

async function ensureFfmpeg(): Promise<void> {
  if (existsSync(ffmpegPath) && existsSync(ffprobePath)) {
    console.log(`使用已有 FFmpeg：${ffmpegPath}`)
    return
  }
  if (process.env.FFMPEG_DIR) throw new Error(`FFMPEG_DIR 下缺少 ffmpeg.exe：${process.env.FFMPEG_DIR}`)
  console.log('未找到 FFmpeg，开始下载（约 200MB）…')
  let lastPercent = -1
  await downloadAndExtract({
    destDir: binDir,
    workDir: baseDir,
    fetchImpl: fetch,
    zipPath: process.env.FFMPEG_ZIP_PATH ?? null,
    onProgress: (received, total) => {
      const percent = total ? Math.floor((received / total) * 100) : -1
      if (percent !== lastPercent && percent % 10 === 0) {
        lastPercent = percent
        console.log(total ? `  下载 ${percent}%（${Math.round(received / 1048576)}MB）` : `  已下载 ${Math.round(received / 1048576)}MB`)
      }
    }
  })
}

async function probeNvenc(): Promise<NvencSupport> {
  const support: NvencSupport = { h264: false, hevc: false, av1: false }
  const encoders = await runCommand(ffmpegPath, ['-hide_banner', '-encoders'], 20_000)
  if (encoders.code !== 0) throw new Error(`-encoders 探测失败：\n${encoders.stderr.slice(-500)}`)
  support.h264 = encoders.stdout.includes('h264_nvenc')
  support.hevc = encoders.stdout.includes('hevc_nvenc')
  support.av1 = encoders.stdout.includes('av1_nvenc')
  if (support.h264) {
    const probe = await runCommand(
      ffmpegPath,
      ['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
      20_000
    )
    if (probe.code !== 0) {
      console.log('NVENC 编译存在但实机编码失败，视为不可用')
      support.h264 = false
      support.hevc = false
      support.av1 = false
    }
  }
  return support
}

async function makeInput(): Promise<void> {
  const result = await runCommand(
    ffmpegPath,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=duration=3:size=640x360:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      inputPath
    ],
    120_000
  )
  if (result.code !== 0) throw new Error(`生成测试输入失败：\n${result.stderr.slice(-800)}`)
}

async function videoCodecOf(file: string): Promise<string> {
  const result = await runCommand(
    ffprobePath,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file],
    20_000
  )
  return result.stdout.trim()
}

async function audioCodecOf(file: string): Promise<string> {
  const result = await runCommand(
    ffprobePath,
    ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file],
    20_000
  )
  return result.stdout.trim()
}

async function convert(label: string, options: EncodeOptions, ext: string, nvenc: NvencSupport): Promise<string> {
  const output = join(baseDir, `${label}.${ext}`)
  rmSync(output, { force: true })
  const { args, usedGpu } = buildFfmpegArgs(inputPath, output, options, nvenc)
  const result = await runCommand(ffmpegPath, args, 300_000)
  if (result.code !== 0) throw new Error(`${label} 转换失败（退出码 ${result.code}）：\n${result.stderr.slice(-800)}`)
  const size = readFileSync(output).length
  if (size === 0) throw new Error(`${label} 输出为空文件`)
  console.log(`PASS ${label}${usedGpu ? ' (GPU)' : ''} -> ${output}`)
  return output
}

async function main(): Promise<void> {
  mkdirSync(baseDir, { recursive: true })
  await ensureFfmpeg()

  const nvenc = await probeNvenc()
  console.log(`NVENC 支持: H.264=${nvenc.h264} H.265=${nvenc.hevc} AV1=${nvenc.av1}`)
  if (!nvenc.h264) throw new Error('本机 NVENC 不可用，GPU 用例无法验证')

  await makeInput()

  const h264Out = await convert('h264-cpu-720p', { ...base, resolution: '720p' }, 'mp4', nvenc)
  if ((await videoCodecOf(h264Out)) !== 'h264') throw new Error('h264 用例输出编码不是 h264')

  const hwdecodeOut = await convert('h264-hwdecode', { ...base, hwaccel: true }, 'mp4', nvenc)
  if ((await videoCodecOf(hwdecodeOut)) !== 'h264') throw new Error('硬件解码用例输出编码不是 h264')

  const h265Out = await convert('h265-gpu-medium', { ...base, presetId: 'mp4-h265', quality: 'medium', accel: 'auto' }, 'mp4', nvenc)
  if ((await videoCodecOf(h265Out)) !== 'hevc') throw new Error('h265 用例输出编码不是 hevc')

  const av1Out = await convert('av1-gpu', { ...base, presetId: 'mp4-av1', accel: 'auto' }, 'mp4', nvenc)
  if ((await videoCodecOf(av1Out)) !== 'av1') throw new Error('av1 用例输出编码不是 av1')

  const mp3Out = await convert('mp3', { ...base, presetId: 'mp3' }, 'mp3', nvenc)
  if ((await audioCodecOf(mp3Out)) !== 'mp3') throw new Error('mp3 用例输出编码不是 mp3')
  if ((await videoCodecOf(mp3Out)) !== '') throw new Error('mp3 用例不应包含视频流')

  const gifOut = await convert('gif', { ...base, presetId: 'gif' }, 'gif', nvenc)
  const header = readFileSync(gifOut).subarray(0, 6).toString('latin1')
  if (!header.startsWith('GIF89a') && !header.startsWith('GIF87a')) throw new Error(`gif 用例文件头异常：${header}`)

  console.log('冒烟测试全部通过')
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`冒烟测试失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
)
