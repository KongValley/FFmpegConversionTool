import { readdirSync, statSync, type Stats } from 'node:fs'
import { join } from 'node:path'
import { isMediaFile } from '../shared/media'

export interface ScanResult {
  files: string[]
  skipped: number
}

function walkDirectory(
  dir: string,
  collected: string[],
  readDir: typeof readdirSync,
  stats: { failed: number }
): void {
  let entries
  try {
    entries = readDir(dir, { withFileTypes: true })
  } catch {
    // 无权限或扫描途中被删除的子目录：跳过并计入“跳过”，不让整批入队失败
    stats.failed += 1
    return
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDirectory(full, collected, readDir, stats)
    } else if (entry.isFile() && isMediaFile(entry.name)) {
      collected.push(full)
    }
  }
}

/**
 * 展开拖入/选择的路径：文件按扩展名过滤，目录递归收集媒体文件。
 * skipped 统计顶层被忽略的输入（不支持的扩展名、不存在路径、没找到媒体文件的目录）与扫描失败的子目录。
 */
export function expandMediaPaths(paths: string[], readDir: typeof readdirSync = readdirSync): ScanResult {
  const files: string[] = []
  const seen = new Set<string>()
  const stats = { failed: 0 }
  let skipped = 0

  for (const input of paths) {
    let statsOfInput: Stats
    try {
      statsOfInput = statSync(input)
    } catch {
      skipped += 1
      continue
    }
    if (statsOfInput.isFile()) {
      if (isMediaFile(input)) files.push(input)
      else skipped += 1
    } else if (statsOfInput.isDirectory()) {
      const before = files.length
      walkDirectory(input, files, readDir, stats)
      if (files.length === before) skipped += 1
    } else {
      skipped += 1
    }
  }

  const unique = files.filter((file) => {
    const key = file.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { files: unique, skipped: skipped + stats.failed }
}
