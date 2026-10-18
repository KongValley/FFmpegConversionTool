import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { sanitizeEncodeOptions } from '../shared/settings'
import type { EncodeOptions, Job, MediaInfo } from '../shared/types'

/** 落盘的队列条目：只保留恢复必需的字段 */
export interface StoredJob {
  id: string
  inputPath: string
  outputPath: string
  options: EncodeOptions
  media: MediaInfo | null
  mergeInputs: string[] | null
  wasRunning: boolean
}

function file(): string {
  return join(app.getPath('userData'), 'queue.json')
}

/** 损坏、版本不符或字段不全的条目直接丢弃，绝不让启动崩在这里 */
export function loadQueue(): StoredJob[] {
  try {
    const parsed = JSON.parse(readFileSync(file(), 'utf8')) as { version?: number; jobs?: unknown }
    if (parsed?.version !== 1 || !Array.isArray(parsed.jobs)) return []
    const stored: StoredJob[] = []
    for (const entry of parsed.jobs) {
      const raw = entry as Partial<StoredJob>
      if (typeof raw.id !== 'string' || typeof raw.inputPath !== 'string' || typeof raw.outputPath !== 'string') continue
      if (!raw.options || typeof raw.options !== 'object') continue
      stored.push({
        id: raw.id,
        inputPath: raw.inputPath,
        outputPath: raw.outputPath,
        options: sanitizeEncodeOptions(raw.options),
        media: (raw.media ?? null) as MediaInfo | null,
        mergeInputs: Array.isArray(raw.mergeInputs)
          ? raw.mergeInputs.filter((path): path is string => typeof path === 'string')
          : null,
        wasRunning: raw.wasRunning === true
      })
    }
    return stored
  } catch {
    return []
  }
}

/** 只落盘未完成任务；写失败只打日志，不影响转换本身 */
export function saveQueue(jobs: Job[]): void {
  const snapshot = {
    version: 1,
    jobs: jobs
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map((job) => ({
        id: job.id,
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        options: job.options,
        media: job.media,
        mergeInputs: job.mergeInputs,
        wasRunning: job.status === 'running'
      }))
  }
  try {
    const target = file()
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(snapshot, null, 2), 'utf8')
  } catch (error) {
    console.error('写入队列快照失败', error)
  }
}
