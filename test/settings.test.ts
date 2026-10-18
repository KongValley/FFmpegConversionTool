import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeSettings } from '../src/shared/settings'

test('并行数钳制在 1–4，缺省与非法值回落 1', () => {
  assert.equal(mergeSettings({ parallel: 99 }).parallel, 4)
  assert.equal(mergeSettings({ parallel: 0 }).parallel, 1)
  assert.equal(mergeSettings({ parallel: 2.7 }).parallel, 2)
  assert.equal(mergeSettings({ parallel: Number.NaN }).parallel, 1)
  assert.equal(mergeSettings(null).parallel, 1)
})

test('手改坏的设置逐字段回落默认', () => {
  const merged = mergeSettings({
    presetId: 'nope',
    quality: 'x',
    accel: 'gpu',
    outputMode: 'custom',
    outputDir: null,
    parallel: 3
  } as never)
  assert.equal(merged.presetId, 'mp4-h264')
  assert.equal(merged.quality, 'high')
  assert.equal(merged.accel, 'auto')
  assert.equal(merged.outputMode, 'source', '自定义目录缺失时退回同源模式')
  assert.equal(merged.outputDir, null)
  assert.equal(merged.parallel, 3)
})

test('高级参数非法值回落，合法值保留', () => {
  const merged = mergeSettings({
    advanced: { rotate: 45, crop: 'bad', fps: -1, videoBitrateKbps: 'abc', resolution: '999x999', uploadCompat: 'yes' }
  } as never)
  assert.equal(merged.advanced.rotate, 0)
  assert.equal(merged.advanced.crop, '')
  assert.equal(merged.advanced.fps, null)
  assert.equal(merged.advanced.videoBitrateKbps, 5000)
  assert.equal(merged.advanced.resolution, '999x999', '合法的自定义分辨率保留')
  assert.equal(merged.advanced.uploadCompat, false, '非布尔值回落 false')

  const kept = mergeSettings({
    advanced: { rotate: 90, crop: '100:50:10:20', fps: 30, resolution: '1080p', sampleRate: 48000 }
  } as never)
  assert.equal(kept.advanced.rotate, 90)
  assert.equal(kept.advanced.crop, '100:50:10:20')
  assert.equal(kept.advanced.fps, 30)
  assert.equal(kept.advanced.sampleRate, 48000)
})

test('上传兼容只在 MP4 (H.264) 下保留', () => {
  assert.equal(mergeSettings({ advanced: { uploadCompat: true } } as never).advanced.uploadCompat, true)
  assert.equal(
    mergeSettings({ presetId: 'mp4-h265', advanced: { uploadCompat: true } } as never).advanced.uploadCompat,
    false
  )
})

test('窗口尺寸字段不全时整块丢弃', () => {
  assert.equal(mergeSettings({ window: { width: 800, height: 600, x: 0, y: 0 } }).window?.width, 800)
  assert.equal(mergeSettings({ window: { width: 800, height: 600, x: null, y: 0 } } as never).window, null)
  assert.equal(mergeSettings({ window: { width: 'x', height: 600, x: 0, y: 0 } } as never).window, null)
})
