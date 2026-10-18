import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { buildFfmpegArgs, splitExtraArgs } from '../src/shared/args'
import { audioCopyExt } from '../src/shared/presets'
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
  hwaccel: false,
  videoCopy: false,
  imageMode: 'single',
  imageTimeSec: 1,
  imageIntervalSec: 1
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

test('复制视频流只输出 -c:v copy，不带编码/缩放参数', () => {
  const { args, usedGpu } = buildFfmpegArgs(
    'in.mkv',
    'out.mp4',
    { ...base, videoCopy: true, resolution: '1080p', fps: 30, hwaccel: true },
    ALL_NVENC
  )
  assert.equal(args[args.indexOf('-c:v') + 1], 'copy')
  assert.equal(usedGpu, false)
  for (const flag of ['-crf', '-preset', '-pix_fmt', '-vf', '-r', '-b:v', '-hwaccel']) {
    assert.ok(!args.includes(flag), `复制模式不应出现 ${flag}`)
  }
  assert.ok(args.includes('-c:a'))
})

test('容器参数按输出扩展名判断', () => {
  const mov = buildFfmpegArgs('in.mp4', 'out.mov', { ...base, presetId: 'mov-h264' }, NO_NVENC)
  assert.ok(!mov.args.includes('-movflags'))
  assert.ok(mov.args.includes('libx264'))

  const mkv = buildFfmpegArgs('in.mp4', 'out.mkv', { ...base, presetId: 'mkv-h264' }, NO_NVENC)
  assert.ok(!mkv.args.includes('-movflags'))

  const m4a = buildFfmpegArgs('in.mp4', 'out.m4a', { ...base, presetId: 'm4a' }, NO_NVENC)
  assert.ok(m4a.args.includes('-movflags'))

  const aac = buildFfmpegArgs('in.mp4', 'out.aac', { ...base, presetId: 'aac' }, NO_NVENC)
  assert.equal(aac.args[aac.args.indexOf('-c:a') + 1], 'aac')
  assert.ok(!aac.args.includes('-movflags'))
})

test('原始音轨复制与扩展名映射', () => {
  const { args } = buildFfmpegArgs('in.mp4', 'out.m4a', { ...base, presetId: 'audio-copy' }, NO_NVENC)
  assert.equal(args[args.indexOf('-c:a') + 1], 'copy')
  assert.ok(args.includes('-vn'))
  assert.ok(!args.includes('-b:a'))
  assert.ok(args.includes('-movflags'))

  assert.equal(audioCopyExt('aac'), 'm4a')
  assert.equal(audioCopyExt('opus'), 'opus')
  assert.equal(audioCopyExt('vorbis'), 'ogg')
  assert.equal(audioCopyExt('weird'), 'mka')
  assert.equal(audioCopyExt(undefined), 'mka')
})

test('OGG (Opus) 与 AAC 预设编码器', () => {
  const ogg = buildFfmpegArgs('in.mp4', 'out.ogg', { ...base, presetId: 'ogg-opus' }, NO_NVENC)
  assert.equal(ogg.args[ogg.args.indexOf('-c:a') + 1], 'libopus')
  assert.ok(!ogg.args.includes('-movflags'))

  const aac = buildFfmpegArgs('in.mp4', 'out.aac', { ...base, presetId: 'aac', audioBitrateKbps: 256 }, NO_NVENC)
  assert.equal(aac.args[aac.args.indexOf('-c:a') + 1], 'aac')
  assert.ok(aac.args.join(' ').includes('-b:a 256k'))
})

test('图片单帧与序列参数', () => {
  const single = buildFfmpegArgs(
    'in.mp4',
    'out.png',
    { ...base, presetId: 'png', imageMode: 'single', imageTimeSec: 3, hwaccel: true },
    ALL_NVENC
  )
  assert.ok(single.args.indexOf('-ss') < single.args.indexOf('-i'))
  assert.equal(single.args[single.args.indexOf('-ss') + 1], '3')
  assert.ok(single.args.join(' ').includes('-frames:v 1 -update 1'))
  assert.equal(single.usedGpu, false)
  for (const flag of ['-c:a', '-hwaccel', '-pix_fmt']) {
    assert.ok(!single.args.includes(flag), `图片输出不应出现 ${flag}`)
  }

  const sequence = buildFfmpegArgs(
    'in.mp4',
    join('frames', '%04d.jpg'),
    { ...base, presetId: 'jpg', imageMode: 'sequence', imageIntervalSec: 2, resolution: '720p' },
    NO_NVENC
  )
  assert.equal(sequence.args[sequence.args.indexOf('-vf') + 1], 'fps=1/2,scale=-2:720')
  assert.ok(!sequence.args.includes('-frames:v'))
  assert.ok(sequence.args.join(' ').includes('-q:v 2'))
})

test('播放列表输入放开协议白名单', () => {
  const hls = buildFfmpegArgs('C:/x/index.m3u8', 'out.mp4', base, NO_NVENC)
  const index = hls.args.indexOf('-protocol_whitelist')
  assert.ok(index > -1)
  assert.equal(hls.args[index + 1], 'file,http,https,tcp,tls,crypto')
  assert.ok(index < hls.args.indexOf('-i'))

  const plain = buildFfmpegArgs('in.mp4', 'out.mp4', base, NO_NVENC)
  assert.ok(!plain.args.includes('-protocol_whitelist'))
})
