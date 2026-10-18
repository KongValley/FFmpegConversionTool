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
