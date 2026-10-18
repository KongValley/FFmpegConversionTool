import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expandMediaPaths } from '../src/main/media-scan'
import { isMediaFile } from '../src/shared/media'

const root = join(process.cwd(), 'tmp', 'test-scan')
const dir = join(root, 'media')
const sub = join(dir, 'sub')

function prepareFixture(): void {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(dir, 'a.mp4'), '')
  writeFileSync(join(dir, 'note.txt'), '')
  writeFileSync(join(sub, 'b.mp3'), '')
}

test('expandMediaPaths', async (t) => {
  prepareFixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  await t.test('目录递归收集媒体文件，忽略目录内非媒体文件', () => {
    const result = expandMediaPaths([dir])
    assert.deepEqual(result.files, [join(dir, 'a.mp4'), join(sub, 'b.mp3')])
    assert.equal(result.skipped, 0)
  })

  await t.test('不支持的扩展名计入跳过', () => {
    const result = expandMediaPaths([join(dir, 'note.txt')])
    assert.deepEqual(result.files, [])
    assert.equal(result.skipped, 1)
  })

  await t.test('不存在的路径计入跳过', () => {
    assert.deepEqual(expandMediaPaths([join(root, 'missing.mp4')]), { files: [], skipped: 1 })
  })

  await t.test('没有媒体文件的目录计入跳过', () => {
    const empty = join(root, 'empty')
    mkdirSync(empty, { recursive: true })
    writeFileSync(join(empty, 'readme.md'), '')
    assert.deepEqual(expandMediaPaths([empty]), { files: [], skipped: 1 })
  })

  await t.test('同批次重复路径去重', () => {
    const file = join(dir, 'a.mp4')
    const result = expandMediaPaths([file, file, dir])
    assert.deepEqual(result.files, [file, join(sub, 'b.mp3')])
  })

  await t.test('无权限子目录跳过并计入跳过，不影响同级文件', () => {
    const locked = join(dir, 'locked')
    mkdirSync(locked, { recursive: true })
    writeFileSync(join(locked, 'c.mp4'), '')
    const fakeReadDir = ((target: string, options: { withFileTypes: true }) => {
      if (String(target).endsWith('locked')) throw new Error('EACCES: permission denied')
      return readdirSync(target, options)
    }) as unknown as typeof readdirSync

    const result = expandMediaPaths([dir], fakeReadDir)
    assert.deepEqual(result.files, [join(dir, 'a.mp4'), join(sub, 'b.mp3')])
    assert.equal(result.skipped, 1)
  })
})

test('媒体扩展名包含 HLS 播放列表', () => {
  assert.equal(isMediaFile('a.m3u8'), true)
  assert.equal(isMediaFile('A.M3U'), true)
  assert.equal(isMediaFile('a.ts'), true)
  assert.equal(isMediaFile('a.txt'), false)
  assert.equal(isMediaFile('noext'), false)
})
