import { accessSync, constants, statSync } from 'node:fs'

/** 检查指定输出目录：不存在 / 不是文件夹 / 不可写时返回中文原因，可用返回 null */
export function checkOutputDir(dir: string): string | null {
  let stats
  try {
    stats = statSync(dir)
  } catch {
    return '输出目录不存在'
  }
  if (!stats.isDirectory()) return '输出目录不是文件夹'
  try {
    accessSync(dir, constants.W_OK)
  } catch {
    return '输出目录不可写'
  }
  return null
}
