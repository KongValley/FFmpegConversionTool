import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ADVANCED } from '../src/shared/settings'
import { effectiveDurationMs } from '../src/shared/trim'
import type { EncodeOptions } from '../src/shared/types'

const base: EncodeOptions = { ...DEFAULT_ADVANCED, presetId: 'mp4-h264', quality: 'high', accel: 'cpu' }

test('effectiveDurationMs 按剪辑区间夹取', () => {
  assert.equal(effectiveDurationMs(3000, { ...base, trimStartSec: 1, trimEndSec: 2 }), 1000)
  assert.equal(effectiveDurationMs(3000, { ...base, trimStartSec: 1 }), 2000)
  assert.equal(effectiveDurationMs(3000, { ...base }), 3000)
  // 终点超出源时长 → 夹取到源时长
  assert.equal(effectiveDurationMs(3000, { ...base, trimEndSec: 8 }), 3000)
  // 终点早于起点 → 0
  assert.equal(effectiveDurationMs(3000, { ...base, trimStartSec: 2, trimEndSec: 1 }), 0)
  assert.equal(effectiveDurationMs(null, { ...base, trimStartSec: 1 }), null)
})
