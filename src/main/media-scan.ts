import { readdirSync, statSync, type Stats } from 'node:fs'
import { join } from 'node:path'
import { isMediaFile } from '../shared/media'

export interface ScanResult {
  files: string[]
  skipped: number
}

function walkDirectory(dir: string, collected: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDirectory(full, collected)
    } else if (entry.isFile() && isMediaFile(entry.name)) {
      collected.push(full)
    }
  }
}

/**
 * 展开拖入/选择的路径：文件按扩展名过滤，目录递归收集媒体文件。
 * skipped 只统计顶层被忽略的输入（不支持的扩展名、不存在路径、没找到媒体文件的目录）。
 */
export function expandMediaPaths(paths: string[]): ScanResult {
  const files: string[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const input of paths) {
    let stats: Stats
    try {
      stats = statSync(input)
    } catch {
      skipped += 1
      continue
    }
    if (stats.isFile()) {
      if (isMediaFile(input)) files.push(input)
      else skipped += 1
    } else if (stats.isDirectory()) {
      const before = files.length
      walkDirectory(input, files)
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
  return { files: unique, skipped }
}
