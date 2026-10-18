import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFfmpegArgs, splitExtraArgs } from '../src/shared/args'
import type { EncodeOptions, NvencSupport } from '../src/shared/types'

const NO_NVENC: NvencSupport = { h264: false, hevc: false, av1: false }
const ALL_NVENC: NvencSupport = { h264: true, hevc: true, av1: true }

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

test('mp4-h264 CPU 高质量 1080p 生成完整参数', () => {
  const { args, usedGpu } = buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, resolution: '1080p' }, NO_NVENC)
  assert.equal(usedGpu, false)
  assert.deepEqual(args, [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'warning',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    '-i',
    'in.mp4',
    '-map',
    '0:v:0?',
    '-map',
    '0:a:0?',
    '-sn',
    '-dn',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    'scale=-2:1080',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    'out.mp4'
  ])
})

test('mp4-h265 auto：NVENC 可用时走 hevc_nvenc 并打 hvc1 标签', () => {
  const gpu = buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, presetId: 'mp4-h265', quality: 'medium', accel: 'auto' }, ALL_NVENC)
  assert.equal(gpu.usedGpu, true)
  assert.ok(gpu.args.join(' ').includes('-c:v hevc_nvenc -rc vbr -cq 25 -b:v 0 -preset p5 -tune hq -pix_fmt yuv420p'))
  assert.ok(gpu.args.join(' ').includes('-movflags +faststart -tag:v hvc1'))
  assert.equal(gpu.args[gpu.args.length - 1], 'out.mp4')

  const cpu = buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, presetId: 'mp4-h265', quality: 'medium', accel: 'auto' }, NO_NVENC)
  assert.equal(cpu.usedGpu, false)
  assert.ok(cpu.args.includes('libx265'))
  assert.ok(cpu.args.includes('-tag:v'))
})

test('webm-vp9 即使 NVENC 全可用也不用 GPU', () => {
  const { args, usedGpu } = buildFfmpegArgs('in.mp4', 'out.webm', { ...base, presetId: 'webm-vp9', accel: 'auto' }, ALL_NVENC)
  assert.equal(usedGpu, false)
  assert.ok(args.includes('libvpx-vp9'))
  assert.ok(args.includes('libopus'))
  assert.ok(!args.includes('h264_nvenc'))
})

test('mp3 预设走 libmp3lame、-vn、192k', () => {
  const { args, usedGpu } = buildFfmpegArgs('in.mp4', 'out.mp3', { ...base, presetId: 'mp3' }, NO_NVENC)
  assert.equal(usedGpu, false)
  assert.deepEqual(args, [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'warning',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    '-i',
    'in.mp4',
    '-map',
    '0:a:0?',
    '-vn',
    '-sn',
    '-dn',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    'out.mp3'
  ])
})

test('gif 使用 palette filter_complex，宽度跟随分辨率', () => {
  const { args } = buildFfmpegArgs('in.mp4', 'out.gif', { ...base, presetId: 'gif' }, NO_NVENC)
  const filter = '[0:v] fps=15,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'
  assert.equal(args[args.indexOf('-filter_complex') + 1], filter)
  assert.ok(args.includes('-loop'))
  assert.ok(args.includes('-an'))

  const wide = buildFfmpegArgs('in.mp4', 'out.gif', { ...base, presetId: 'gif', resolution: '1080p' }, NO_NVENC)
  assert.ok(wide.args[wide.args.indexOf('-filter_complex') + 1].includes('scale=1920:-2'))
})

test('码率模式与额外参数拼接', () => {
  const { args } = buildFfmpegArgs(
    'in.mp4',
    'out.mp4',
    {
      ...base,
      accel: 'auto',
      rateMode: 'bitrate',
      videoBitrateKbps: 3000,
      fps: 30,
      channels: '2',
      sampleRate: 48000,
      extraArgs: '-metadata title=test'
    },
    ALL_NVENC
  )
  assert.ok(args.join(' ').includes('-c:v h264_nvenc -rc vbr -b:v 3000k -pix_fmt yuv420p'))
  assert.ok(args.join(' ').includes('-r 30'))
  assert.ok(args.join(' ').includes('-ac 2 -ar 48000'))
  assert.deepEqual(args.slice(-3), ['-metadata', 'title=test', 'out.mp4'])
})

test('splitExtraArgs 忽略空串', () => {
  assert.deepEqual(splitExtraArgs('  -metadata  title=a  '), ['-metadata', 'title=a'])
  assert.deepEqual(splitExtraArgs(''), [])
})

test('hwaccel 只加在视频预设的 -i 之前', () => {
  const video = buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, hwaccel: true }, NO_NVENC)
  const hwIndex = video.args.indexOf('-hwaccel')
  assert.ok(hwIndex > -1)
  assert.equal(video.args[hwIndex + 1], 'cuda')
  assert.ok(hwIndex < video.args.indexOf('-i'))

  const audio = buildFfmpegArgs('in.mp4', 'out.mp3', { ...base, presetId: 'mp3', hwaccel: true }, NO_NVENC)
  assert.ok(!audio.args.includes('-hwaccel'))

  const gif = buildFfmpegArgs('in.mp4', 'out.gif', { ...base, presetId: 'gif', hwaccel: true }, NO_NVENC)
  assert.ok(!gif.args.includes('-hwaccel'))
})
