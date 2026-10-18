import { computed, reactive, watch } from 'vue'
import { DEFAULT_ADVANCED, DEFAULT_SETTINGS } from '@shared/settings'
import type { EncodeOptions, FfmpegState, Job, Settings } from '@shared/types'

export const state = reactive({
  jobs: [] as Job[],
  ffmpeg: {
    status: 'missing',
    version: null,
    installProgress: null,
    error: null,
    nvenc: null
  } as FfmpegState,
  settings: { ...DEFAULT_SETTINGS, advanced: { ...DEFAULT_ADVANCED } } as Settings,
  advanced: { ...DEFAULT_ADVANCED },
  paused: false,
  settingsSaved: true
})

function upsert(job: Job): void {
  const index = state.jobs.findIndex((j) => j.id === job.id)
  if (index === -1) state.jobs.push(job)
  else state.jobs[index] = job
  if (job.status === 'running') selectedIds.delete(job.id)
}

export function currentOptions(): EncodeOptions {
  return {
    presetId: state.settings.presetId,
    quality: state.settings.quality,
    accel: state.settings.accel,
    rateMode: state.advanced.rateMode,
    videoBitrateKbps: state.advanced.videoBitrateKbps,
    resolution: state.advanced.resolution,
    fps: state.advanced.fps,
    audioCodec: state.advanced.audioCodec,
    audioBitrateKbps: state.advanced.audioBitrateKbps,
    channels: state.advanced.channels,
    sampleRate: state.advanced.sampleRate,
    extraArgs: state.advanced.extraArgs,
    hwaccel: state.advanced.hwaccel,
    videoCopy: state.advanced.videoCopy,
    uploadCompat: state.advanced.uploadCompat,
    imageMode: state.advanced.imageMode,
    imageTimeSec: state.advanced.imageTimeSec,
    imageIntervalSec: state.advanced.imageIntervalSec,
    trimStartSec: state.advanced.trimStartSec,
    trimEndSec: state.advanced.trimEndSec,
    crop: state.advanced.crop,
    rotate: state.advanced.rotate,
    normalizeAudio: state.advanced.normalizeAudio
  }
}

export async function init(): Promise<() => void> {
  const offState = window.api.ffmpeg.onState((next) => {
    state.ffmpeg = next
  })
  const offUpdate = window.api.jobs.onUpdate(upsert)
  // 先订阅再拉取：恢复的任务与订阅期间的增量都不会丢
  state.jobs = await window.api.jobs.list()
  state.ffmpeg = await window.api.ffmpeg.getState()
  const settings = await window.api.settings.get()
  state.settings = settings
  Object.assign(state.advanced, settings.advanced)

  // 高级参数改动后 400ms 落盘；监听在初始赋值之后注册，避免启动即回写
  let saveTimer: number | undefined
  const stopWatch = watch(
    state.advanced,
    () => {
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        void window.api.settings
          .set({ advanced: { ...state.advanced } })
          .then(({ settings, saved }) => {
            state.settings.advanced = settings.advanced
            state.settingsSaved = saved
          })
          .catch(() => {
            state.settingsSaved = false
          })
      }, 400)
    },
    { deep: true }
  )

  return () => {
    window.clearTimeout(saveTimer)
    stopWatch()
    offState()
    offUpdate()
  }
}

export async function addFiles(
  paths: string[]
): Promise<{ added: number; skipped: number; duplicates: number }> {
  if (paths.length === 0) return { added: 0, skipped: 0, duplicates: 0 }
  const { jobs: created, skipped, duplicates } = await window.api.jobs.enqueue(paths, currentOptions())
  for (const job of created) upsert(job)
  return { added: created.length, skipped, duplicates }
}

export async function startQueue(): Promise<void> {
  await window.api.jobs.start()
}

/** 勾选等待中的任务准备合并（Vue 3 对 Set 的变更可响应） */
export const selectedIds = reactive(new Set<string>())
export const selectedCount = computed(() => selectedIds.size)

/** 选中里仍是“等待中”的数量：合并只用这些 */
export const selectedQueuedCount = computed(
  () => state.jobs.filter((job) => selectedIds.has(job.id) && job.status === 'queued').length
)
export const failedCount = computed(() => state.jobs.filter((job) => job.status === 'error').length)
export const doneCount = computed(() => state.jobs.filter((job) => job.status === 'done').length)
/** 可勾选行：除运行中外都可以选中（供移除/合并） */
export const selectableIds = computed(() =>
  state.jobs.filter((job) => job.status !== 'running').map((job) => job.id)
)
export const allSelected = computed(
  () => selectableIds.value.length > 0 && selectableIds.value.every((id) => selectedIds.has(id))
)

export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

export function clearSelection(): void {
  selectedIds.clear()
}

/** 全选 / 取消全选（只作用于可勾选行） */
export function toggleSelectAll(): void {
  if (allSelected.value) clearSelection()
  else for (const id of selectableIds.value) selectedIds.add(id)
}

async function removeIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const removed = await window.api.jobs.removeMany(ids)
  const gone = new Set(removed)
  state.jobs = state.jobs.filter((job) => !gone.has(job.id))
  for (const id of gone) selectedIds.delete(id)
  return removed.length
}

/** 移除勾选的任务（运行中的行没有复选框，主进程也会跳过） */
export async function removeSelected(): Promise<number> {
  return removeIds([...selectedIds])
}

/** 清空队列：移除所有非运行任务，运行中的继续转换；只删列表不删文件 */
export async function clearQueue(): Promise<number> {
  return removeIds(selectableIds.value)
}

/** 清空已完成：只移除列表里已完成的任务，不删已转换的文件 */
export async function clearDone(): Promise<number> {
  return removeIds(state.jobs.filter((job) => job.status === 'done').map((job) => job.id))
}

/** 逐行重试所有失败任务（复用既有 retry IPC） */
export async function retryFailed(): Promise<number> {
  const ids = state.jobs.filter((job) => job.status === 'error').map((job) => job.id)
  for (const id of ids) await retryJob(id)
  return ids.length
}

/** 合并所选任务：主进程移除原任务并新建合并任务，界面同步移除后再插入合并任务 */
export async function mergeSelected(): Promise<number> {
  const ids = state.jobs.filter((job) => selectedIds.has(job.id) && job.status === 'queued').map((job) => job.id)
  const merged = await window.api.jobs.merge(ids, currentOptions())
  const picked = new Set(ids)
  state.jobs = state.jobs.filter((entry) => !picked.has(entry.id))
  upsert(merged)
  clearSelection()
  return ids.length
}

export async function cancelJob(id: string): Promise<void> {
  await window.api.jobs.cancel(id)
}

export async function removeJob(id: string): Promise<void> {
  const job = state.jobs.find((entry) => entry.id === id)
  await window.api.jobs.remove(id)
  // 运行中的任务是先取消再保留，其余由主进程直接移出队列
  if (job?.status === 'running') return
  state.jobs = state.jobs.filter((entry) => entry.id !== id)
  selectedIds.delete(id)
}

export async function retryJob(id: string): Promise<void> {
  await window.api.jobs.retry(id)
}

export async function cancelAll(): Promise<void> {
  for (const job of state.jobs) {
    if (job.status === 'queued' || job.status === 'running') await cancelJob(job.id)
  }
}

/** 暂停队列：主进程中断运行中的任务并退回等待队列，恢复后从头重跑 */
export async function pauseAll(): Promise<void> {
  await window.api.jobs.pause()
  state.paused = true
}

/** 继续队列：解除暂停，被中断的任务从头重跑 */
export async function resumeAll(): Promise<void> {
  await window.api.jobs.resume()
  state.paused = false
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  try {
    const { settings, saved } = await window.api.settings.set(patch)
    state.settings = settings
    state.settingsSaved = saved
  } catch {
    // IPC 失败（极端情况）也要让「设置未写入」提示出来，而不是静默丢掉
    state.settingsSaved = false
  }
}
