import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { buildFfmpegArgs, buildMergeArgs } from '../shared/args'
import { concatCompatibilityError, concatListContent } from '../shared/concat'
import { effectiveDurationMs } from '../shared/trim'
import { parseProgressLine, progressFrom } from '../shared/progress'
import { PRESETS, audioCopyExt } from '../shared/presets'
import type { EncodeOptions, Job, MediaInfo } from '../shared/types'
import { getPaths, isInstalled, probeCapabilities } from './ffmpeg/manager'
import { killTree } from './ffmpeg/exec'
import { expandMediaPaths } from './media-scan'
import { probeMedia } from './probe'
import { getSettings } from './settings'

export interface DrainSummary {
  done: number
  failed: number
  canceled: number
  firstFailed: string | null
}

const jobs: Job[] = []
let jobListener: (job: Job) => void = () => undefined
let drainListener: (summary: DrainSummary) => void = () => undefined
let activeJob: { id: string; child: ChildProcess | null; canceled: boolean } | null = null
let running = false
let batchFinished = 0
const drained = new Set<string>()

const STDERR_TAIL_LINES = 15
const PROGRESS_THROTTLE_MS = 200

export function setJobListener(listener: (job: Job) => void): void {
  jobListener = listener
}

export function setDrainListener(listener: (summary: DrainSummary) => void): void {
  drainListener = listener
}

/** 任务落定（完成/失败/取消）的统一记账：批次进度与完成汇总都依赖它 */
function settle(job: Job, status: Job['status']): void {
  job.status = status
  batchFinished += 1
  drained.add(job.id)
  emitJob(job)
}

/** 只在有任务运行时返回，空闲时让调用方清掉任务栏进度条 */
export function getQueueProgress(): { percent: number } | null {
  const runningJobs = jobs.filter((job) => job.status === 'running')
  if (runningJobs.length === 0) return null
  const queued = jobs.filter((job) => job.status === 'queued').length
  const current = runningJobs[0].progress.percent ?? 0
  const total = batchFinished + queued + runningJobs.length
  if (total === 0) return null
  return { percent: Math.round(((batchFinished + current / 100) / total) * 100) }
}

function summarizeDrain(): DrainSummary {
  let done = 0
  let failed = 0
  let canceled = 0
  let firstFailed: string | null = null
  for (const id of drained) {
    const job = jobs.find((entry) => entry.id === id)
    if (!job) continue
    if (job.status === 'done') done += 1
    else if (job.status === 'canceled') canceled += 1
    else {
      failed += 1
      firstFailed ??= basename(job.inputPath)
    }
  }
  return { done, failed, canceled, firstFailed }
}

/** 只广播仍在队列里的任务，避免已移除任务被重新插回界面 */
function emitJob(job: Job): void {
  if (jobs.includes(job)) jobListener({ ...job, progress: { ...job.progress }, options: { ...job.options } })
}

function emptyProgress(): Job['progress'] {
  return { percent: 0, outTimeMs: 0, speed: null, fps: null, etaSec: null, sizeBytes: null }
}

export function uniqueOutputPath(
  inputPath: string,
  ext: string,
  outputDir: string | null,
  excludeId?: string
): string {
  const dir = outputDir ?? dirname(inputPath)
  mkdirSync(dir, { recursive: true })
  const base = basename(inputPath, extname(inputPath))
  // 同一批次的输出路径在任何文件落盘前就已确定，必须把已入队任务的路径也算作占用，
  // 否则同名输入的第二个任务会覆盖第一个的输出（Windows 大小写不敏感，统一小写比较）
  const taken = new Set(jobs.filter((job) => job.id !== excludeId).map((job) => job.outputPath.toLowerCase()))
  let candidate = join(dir, `${base}_converted.${ext}`)
  let index = 2
  while (existsSync(candidate) || taken.has(candidate.toLowerCase())) {
    candidate = join(dir, `${base}_converted_${index}.${ext}`)
    index += 1
  }
  return candidate
}

/** 图片序列导出到独立目录：<原名>_converted_frames，重名递增 */
export function uniqueOutputDir(inputPath: string, outputDir: string | null): string {
  const dir = outputDir ?? dirname(inputPath)
  const base = basename(inputPath, extname(inputPath))
  let candidate = join(dir, `${base}_converted_frames`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}_converted_frames_${index}`)
    index += 1
  }
  mkdirSync(candidate, { recursive: true })
  return candidate
}

/** enqueue 与 retry 共用的输出路径计算（原始音轨扩展名随源编码、序列为目录） */
export function resolveOutputPath(inputPath: string, options: EncodeOptions, media: MediaInfo | null): string {
  const preset = PRESETS[options.presetId]
  const outputDir = getSettings().outputMode === 'custom' ? getSettings().outputDir : null
  if (preset.audioCopy) return uniqueOutputPath(inputPath, audioCopyExt(media?.audio?.codec), outputDir)
  if (preset.kind === 'image' && options.imageMode === 'sequence') return uniqueOutputDir(inputPath, outputDir)
  return uniqueOutputPath(inputPath, preset.ext, outputDir)
}

/** 合并输出：<原名>_merged.<ext>，与已有文件、已入队任务都不重名 */
export function uniqueMergedPath(
  inputPath: string,
  ext: string,
  outputDir: string | null,
  excludeId?: string
): string {
  const dir = outputDir ?? dirname(inputPath)
  mkdirSync(dir, { recursive: true })
  const base = basename(inputPath, extname(inputPath))
  const taken = new Set(jobs.filter((job) => job.id !== excludeId).map((job) => job.outputPath.toLowerCase()))
  let candidate = join(dir, `${base}_merged.${ext}`)
  let index = 2
  while (existsSync(candidate) || taken.has(candidate.toLowerCase())) {
    candidate = join(dir, `${base}_merged_${index}.${ext}`)
    index += 1
  }
  return candidate
}

/** 合并所选“等待中”任务为一次无损拼接；被合并任务从未转换，直接移出队列 */
export async function enqueueMerge(ids: string[], options: EncodeOptions): Promise<Job> {
  if (!isInstalled()) throw new Error('FFmpeg 尚未安装')
  const preset = PRESETS[options.presetId]
  if (preset.kind !== 'video') throw new Error('合并仅支持视频预设')
  const selected: Job[] = []
  for (const id of ids) {
    const job = jobs.find((entry) => entry.id === id)
    if (!job || job.status !== 'queued') throw new Error('只能合并等待中的任务')
    selected.push(job)
  }
  if (selected.length < 2) throw new Error('至少选择 2 个文件')
  const compatibility = concatCompatibilityError(selected.map((job) => job.media))
  if (compatibility) throw new Error(compatibility)

  const first = selected[0]
  const durations = selected.map((job) => job.media?.durationMs ?? null)
  const outputDir = getSettings().outputMode === 'custom' ? getSettings().outputDir : null
  for (const job of selected) jobs.splice(jobs.indexOf(job), 1)
  const merged: Job = {
    id: randomUUID(),
    inputPath: first.inputPath,
    outputPath: uniqueMergedPath(first.inputPath, preset.ext, outputDir),
    // 合并是复制流：剪辑/滤镜字段不适用，清掉避免影响进度估算
    options: { ...options, trimStartSec: null, trimEndSec: null },
    media: {
      durationMs: durations.every((ms) => ms !== null) ? durations.reduce((sum, ms) => sum + (ms ?? 0), 0) : null,
      format: 'concat',
      hasVideo: true,
      hasAudio: first.media?.hasAudio ?? false,
      video: first.media?.video,
      audio: first.media?.audio
    },
    status: 'queued',
    progress: emptyProgress(),
    usedGpu: false,
    fallbackNote: null,
    error: null,
    mergeInputs: selected.map((job) => job.inputPath)
  }
  jobs.push(merged)
  emitJob(merged)
  void startQueue()
  return { ...merged, options: { ...merged.options }, progress: { ...merged.progress } }
}

export async function enqueueJobs(
  paths: string[],
  options: EncodeOptions
): Promise<{ jobs: Job[]; skipped: number }> {
  if (!isInstalled()) throw new Error('FFmpeg 尚未安装')
  const { files, skipped } = expandMediaPaths(paths)
  if (files.length === 0) throw new Error('未找到可转换的媒体文件')
  const { ffprobePath } = getPaths()
  const created: Job[] = []
  for (const inputPath of files) {
    let media: MediaInfo | null = null
    let error: string | null = null
    try {
      media = await probeMedia(inputPath, ffprobePath)
    } catch (probeError) {
      error = probeError instanceof Error ? probeError.message : String(probeError)
    }
    const job: Job = {
      id: randomUUID(),
      inputPath,
      outputPath: resolveOutputPath(inputPath, options, media),
      options: { ...options },
      media,
      status: 'queued',
      progress: emptyProgress(),
      usedGpu: false,
      fallbackNote: null,
      error,
      mergeInputs: null
    }
    jobs.push(job)
    created.push({ ...job })
    emitJob(job)
  }
  return { jobs: created, skipped }
}

/** 失败任务一键重试：重置状态、重新计算不冲突的输出路径，并立刻继续队列 */
export async function retryJob(id: string): Promise<Job | null> {
  const job = jobs.find((entry) => entry.id === id)
  if (!job || job.status !== 'error') return null
  if (!job.media) {
    // 上次探测失败（例如文件被临时移走），重试时补一次，界面才能显示媒体信息
    try {
      job.media = await probeMedia(job.inputPath, getPaths().ffprobePath)
    } catch {
      job.media = null
    }
  }
  const preset = PRESETS[job.options.presetId]
  const outputDir = getSettings().outputMode === 'custom' ? getSettings().outputDir : null
  job.outputPath = job.mergeInputs
    ? uniqueMergedPath(job.mergeInputs[0], preset.ext, outputDir, job.id)
    : preset.audioCopy
      ? uniqueOutputPath(job.inputPath, audioCopyExt(job.media?.audio?.codec), outputDir, job.id)
      : preset.kind === 'image' && job.options.imageMode === 'sequence'
        ? uniqueOutputDir(job.inputPath, outputDir)
        : uniqueOutputPath(job.inputPath, preset.ext, outputDir, job.id)
  job.status = 'queued'
  job.error = null
  job.fallbackNote = null
  job.usedGpu = false
  job.progress = emptyProgress()
  emitJob(job)
  void startQueue()
  return { ...job, options: { ...job.options }, progress: { ...job.progress } }
}

/** 合并列表写入系统临时目录；任务结束（含取消）后删除 */
function writeConcatList(jobId: string, inputs: string[]): string {
  const dir = join(app.getPath('temp'), 'media-converter')
  mkdirSync(dir, { recursive: true })
  const listPath = join(dir, `${jobId}.txt`)
  writeFileSync(listPath, concatListContent(inputs), 'utf8')
  return listPath
}

async function spawnAttempt(
  job: Job,
  options: EncodeOptions
): Promise<{ code: number; stderr: string; outTimeUs: number }> {
  const { ffmpegPath } = getPaths()
  const nvenc = await probeCapabilities()
  const preset = PRESETS[options.presetId]
  // 图片序列输出到目录内的编号文件，其余输出为单一路径
  const outputArg =
    preset.kind === 'image' && options.imageMode === 'sequence'
      ? join(job.outputPath, `%04d.${preset.ext}`)
      : job.outputPath
  // 合并任务走 concat demuxer + 复制流，不使用 GPU
  const listPath = job.mergeInputs ? writeConcatList(job.id, job.mergeInputs) : null
  const { args, usedGpu } = listPath
    ? { args: buildMergeArgs(listPath, outputArg, options), usedGpu: false }
    : buildFfmpegArgs(job.inputPath, outputArg, options, nvenc)
  // 纯音频输入即便预设支持 NVENC 也不会用到 GPU，徽章不能误报
  job.usedGpu = usedGpu && (job.media?.hasVideo ?? true)
  const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  activeJob = { id: job.id, child, canceled: false }

  const stderrLines: string[] = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue
      stderrLines.push(line.trim())
      if (stderrLines.length > STDERR_TAIL_LINES) stderrLines.shift()
    }
  })

  const durationMs = effectiveDurationMs(job.media?.durationMs ?? null, options)
  let outTimeUs = 0
  let speed: string | null = null
  let fps: number | null = null
  let sizeBytes: number | null = null
  let lastEmit = 0
  const push = (percentOverride?: number): void => {
    const progress = progressFrom(outTimeUs, durationMs, speed)
    job.progress = {
      ...progress,
      percent: percentOverride ?? progress.percent,
      fps,
      sizeBytes
    }
    emitJob(job)
  }

  child.stdout.setEncoding('utf8')
  const handleLine = (line: string): void => {
    const kv = parseProgressLine(line)
    if (!kv) return
    const [key, value] = kv
    if (key === 'out_time_us') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0) outTimeUs = n
    } else if (key === 'speed') {
      speed = value === 'N/A' ? null : value
    } else if (key === 'fps') {
      const n = Number(value)
      fps = Number.isFinite(n) ? n : null
    } else if (key === 'total_size') {
      const n = Number(value)
      sizeBytes = Number.isFinite(n) && n >= 0 ? n : null
    } else if (key === 'progress') {
      if (value === 'end') {
        push(100)
        return
      }
      const now = Date.now()
      if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now
        push()
      }
    }
  }

  let pending = ''
  child.stdout.on('data', (chunk: string) => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  })

  const [code] = (await once(child, 'close')) as [number | null]
  if (listPath) rmSync(listPath, { force: true })
  const canceled = activeJob?.canceled ?? false
  activeJob = null
  if (canceled) return { code: -2, stderr: stderrLines.join('\n'), outTimeUs }
  return { code: code ?? -1, stderr: stderrLines.join('\n'), outTimeUs }
}

/** 图片序列的产物是一个目录，其余是单个文件 */
function cleanupPartial(job: Job, options: EncodeOptions): void {
  const preset = PRESETS[options.presetId]
  if (preset.kind === 'image' && options.imageMode === 'sequence') {
    rmSync(job.outputPath, { recursive: true, force: true })
    return
  }
  rmSync(job.outputPath, { force: true })
}

async function runJob(job: Job): Promise<void> {
  job.status = 'running'
  job.error = null
  job.fallbackNote = null
  job.progress = emptyProgress()
  emitJob(job)

  const notes: string[] = []
  let options = job.options
  let attempt = await spawnAttempt(job, options)

  // 回退 1：复制视频流失败（容器或编码不兼容）→ 重新编码；合并本身即复制，重试无意义
  if (attempt.code !== 0 && attempt.code !== -2 && options.videoCopy && !job.mergeInputs) {
    cleanupPartial(job, options)
    options = { ...options, videoCopy: false }
    notes.push('复制视频流失败（容器或编码不兼容），已自动重新编码')
    job.fallbackNote = notes.join('；')
    emitJob(job)
    attempt = await spawnAttempt(job, options)
  }

  // 回退 2：GPU 编码失败 → 最保守的 CPU + 软件解码
  if (attempt.code !== 0 && attempt.code !== -2 && job.usedGpu) {
    cleanupPartial(job, options)
    options = { ...options, accel: 'cpu', hwaccel: false }
    notes.push('GPU 编码失败，已自动改用 CPU')
    job.fallbackNote = notes.join('；')
    emitJob(job)
    attempt = await spawnAttempt(job, options)
  }

  if (attempt.code === -2) {
    finishCanceled(job)
    return
  }
  if (attempt.code === 0) {
    // ffmpeg 对超出时长的截图会以退出码 0 结束但不写文件，必须核实产物
    const preset = PRESETS[options.presetId]
    if (preset.kind === 'image') {
      const produced =
        options.imageMode === 'sequence' ? readdirSync(job.outputPath).length > 0 : existsSync(job.outputPath)
      if (!produced) {
        job.error =
          options.imageMode === 'sequence'
            ? '没有可导出的画面'
            : '该时间点没有可导出的画面（时间点可能超出视频时长）'
        cleanupPartial(job, options)
        settle(job, 'error')
        return
      }
    } else {
      // 越界的 -ss/-t 同样以退出码 0 结束：progress 报 out_time=N/A、产物为空壳，必须核实
      const size = statSync(job.outputPath, { throwIfNoEntry: false })?.size ?? 0
      if (attempt.outTimeUs === 0 || size === 0) {
        job.error = '未生成输出内容（时间裁剪可能超出源时长）'
        cleanupPartial(job, options)
        settle(job, 'error')
        return
      }
    }
    job.progress = { ...job.progress, percent: 100 }
    settle(job, 'done')
    return
  }
  job.error = `FFmpeg 失败（退出码 ${attempt.code}）\n${attempt.stderr}`
  cleanupPartial(job, options)
  settle(job, 'error')
}

function finishCanceled(job: Job): void {
  cleanupPartial(job, job.options)
  settle(job, 'canceled')
}

export async function startQueue(): Promise<void> {
  if (running) return
  running = true
  batchFinished = 0
  drained.clear()
  try {
    for (;;) {
      for (const job of jobs) {
        if (job.status === 'queued' && job.error) {
          job.error = `${job.error}\n（探测失败，跳过转换）`
          settle(job, 'error')
        }
      }
      const next = jobs.find((job) => job.status === 'queued')
      if (!next) break
      await runJob(next)
    }
    const summary = summarizeDrain()
    if (summary.done + summary.failed + summary.canceled > 0) drainListener(summary)
  } finally {
    batchFinished = 0
    drained.clear()
    running = false
  }
}

export async function cancelJob(id: string): Promise<void> {
  const job = jobs.find((j) => j.id === id)
  if (!job) return
  if (job.status === 'queued') {
    settle(job, 'canceled')
    return
  }
  if (job.status === 'running' && activeJob?.id === id) {
    activeJob.canceled = true
    const pid = activeJob.child?.pid
    if (pid) await killTree(pid)
  }
}

export async function removeJob(id: string): Promise<void> {
  const index = jobs.findIndex((j) => j.id === id)
  if (index === -1) return
  const job = jobs[index]
  if (job.status === 'running') {
    await cancelJob(id)
    return
  }
  jobs.splice(index, 1)
}
