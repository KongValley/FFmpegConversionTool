import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProgressLine, progressFrom } from '../src/shared/progress'

test('parseProgressLine 解析 key=value 并忽略非法行', () => {
  assert.deepEqual(parseProgressLine('out_time_us=1000000'), ['out_time_us', '1000000'])
  assert.deepEqual(parseProgressLine('speed= 2.5x '), ['speed', '2.5x'])
  assert.deepEqual(parseProgressLine('progress=continue'), ['progress', 'continue'])
  assert.equal(parseProgressLine('no-equals'), null)
  assert.equal(parseProgressLine('=value'), null)
})

test('progressFrom 计算百分比与剩余时间', () => {
  const p = progressFrom(1_000_000, 10_000, '2x')
  assert.equal(p.percent, 10)
  assert.equal(p.outTimeMs, 1000)
  assert.equal(p.etaSec, 4.5)
  assert.equal(p.speed, '2x')
})

test('progressFrom 时长未知或速度非法时不猜值', () => {
  assert.equal(progressFrom(500_000, null, '1x').percent, null)
  assert.equal(progressFrom(500_000, 10_000, null).etaSec, null)
  assert.equal(progressFrom(500_000, 10_000, 'N/A').etaSec, null)
})

test('progressFrom 越界钳制在 0..100', () => {
  assert.equal(progressFrom(2_500_000, 10_000, '4x').percent, 25)
  assert.equal(progressFrom(20_000_000, 10_000, '4x').percent, 100)
  assert.equal(progressFrom(-1, 10_000, '4x').outTimeMs, 0)
  assert.equal(progressFrom(20_000_000, 10_000, '4x').etaSec, 0)
})
