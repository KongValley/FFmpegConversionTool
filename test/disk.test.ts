import test from 'node:test'
import assert from 'node:assert/strict'
import { diskSpaceWarning, estimateOutputBytes } from '../src/shared/disk'
import { DEFAULT_ADVANCED } from '../src/shared/settings'
import type { EncodeOptions, MediaInfo } from '../src/shared/types'

const base: EncodeOptions = { ...DEFAULT_ADVANCED, presetId: 'mp4-h264', quality: 'high', accel: 'cpu' }

const media = (durationMs: number, bitrateKbps: number): MediaInfo => ({
  durationMs,
  format: 'mp4',
  hasVideo: true,
  hasAudio: true,
  video: { codec: 'h264', width: 1920, height: 1080, fps: 30, bitrateKbps },
  audio: { codec: 'aac', sampleRate: 48000, channels: 2, bitrateKbps: 192 }
})

test('码率模式按 视频+音频 码率估算', () => {
  const options = { ...base, rateMode: 'bitrate' as const, videoBitrateKbps: 3000, audioBitrateKbps: 192 }
  assert.equal(estimateOutputBytes(media(60_000, 5000), options), (3000 + 192 + 32) * 60 * 125)
})

test('质量模式按源码率上浮，源码率过低时取 2000 下限', () => {
  const high = estimateOutputBytes(media(60_000, 5000), { ...base, audioBitrateKbps: 192 })
  assert.equal(high, (5000 * 2.5 + 192 + 32) * 60 * 125)

  const low = estimateOutputBytes(media(60_000, 500), { ...base, audioBitrateKbps: 192 })
  assert.equal(low, (2000 * 2.5 + 192 + 32) * 60 * 125)

  const medium = estimateOutputBytes(media(60_000, 5000), { ...base, quality: 'medium', audioBitrateKbps: 192 })
  assert.ok(medium !== null && high !== null && medium < high)
})

test('音频预设只算音频，图片/GIF 与未知时长不估算', () => {
  const audio = estimateOutputBytes(media(60_000, 5000), { ...base, presetId: 'mp3', audioBitrateKbps: 192 })
  assert.equal(audio, (0 + 192 + 32) * 60 * 125)

  assert.equal(estimateOutputBytes(media(60_000, 5000), { ...base, presetId: 'png' }), null)
  assert.equal(estimateOutputBytes(media(60_000, 5000), { ...base, presetId: 'gif' }), null)
  assert.equal(estimateOutputBytes({ ...media(60_000, 5000), durationMs: null }, base), null)
  assert.equal(estimateOutputBytes(null, base), null)
})

test('剩余空间不足估算值的 1.1 倍时才提示', () => {
  assert.ok(diskSpaceWarning(100e9, 90e9)?.includes('磁盘剩余空间可能不足'))
  assert.equal(diskSpaceWarning(10e9, 90e9), null)
  assert.equal(diskSpaceWarning(100e9, 110e9), null)
})
