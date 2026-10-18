import test from 'node:test'
import assert from 'node:assert/strict'
import { concatCompatibilityError, concatListContent } from '../src/shared/concat'
import type { MediaInfo } from '../src/shared/types'

function media(over: Partial<MediaInfo> = {}): MediaInfo {
  return {
    durationMs: 1000,
    format: 'mp4',
    hasVideo: true,
    hasAudio: true,
    video: { codec: 'h264', width: 640, height: 360, fps: 30, bitrateKbps: 1000 },
    audio: { codec: 'aac', sampleRate: 44100, channels: 2, bitrateKbps: 128 },
    ...over
  }
}

test('concatListContent 逐行 file 且转义单引号', () => {
  assert.equal(concatListContent(['a.mp4', 'b.mp4']), "file 'a.mp4'\nfile 'b.mp4'\n")
  assert.equal(concatListContent(["it's.mp4"]), "file 'it'\\''s.mp4'\n")
})

test('concatCompatibilityError：参数一致通过', () => {
  assert.equal(concatCompatibilityError([media(), media({ durationMs: 2000 })]), null)
})

test('concatCompatibilityError：未探测与无视频', () => {
  assert.equal(concatCompatibilityError([media(), null]), '存在未探测成功的文件，无法合并')
  assert.equal(concatCompatibilityError([media(), media({ hasVideo: false, video: undefined })]), '只能合并包含视频的文件')
})

test('concatCompatibilityError：视频编码/分辨率不一致', () => {
  const other = media({ video: { codec: 'h264', width: 1280, height: 720, fps: 30, bitrateKbps: 1000 } })
  assert.equal(concatCompatibilityError([media(), other]), '所选文件的视频编码或分辨率不一致，无法无损合并')
  const codec = media({ video: { codec: 'hevc', width: 640, height: 360, fps: 30, bitrateKbps: 1000 } })
  assert.equal(concatCompatibilityError([media(), codec]), '所选文件的视频编码或分辨率不一致，无法无损合并')
})

test('concatCompatibilityError：音频有无/参数不一致', () => {
  const silent = media({ hasAudio: false, audio: undefined })
  assert.equal(concatCompatibilityError([media(), silent]), '所选文件有的含音频、有的不含，无法无损合并')
  const mono = media({ audio: { codec: 'aac', sampleRate: 44100, channels: 1, bitrateKbps: 128 } })
  assert.equal(concatCompatibilityError([media(), mono]), '所选文件的音频参数不一致，无法无损合并')
  const mp3 = media({ audio: { codec: 'mp3', sampleRate: 44100, channels: 2, bitrateKbps: 128 } })
  assert.equal(concatCompatibilityError([media(), mp3]), '所选文件的音频参数不一致，无法无损合并')
  // 都无音频时不做音频比较
  assert.equal(concatCompatibilityError([silent, silent]), null)
})
