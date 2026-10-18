import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkOutputDir } from '../src/main/output-dir'

const root = mkdtempSync(join(tmpdir(), 'mc-outdir-'))

test('输出目录校验', (t) => {
  t.after(() => rmSync(root, { recursive: true, force: true }))

  assert.equal(checkOutputDir(root), null, '已存在目录可用')

  assert.equal(checkOutputDir(join(root, 'missing')), '输出目录不存在')

  const file = join(root, 'a.mp4')
  writeFileSync(file, '')
  assert.equal(checkOutputDir(file), '输出目录不是文件夹')
})
