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
  advanced: { ...DEFAULT_ADVANCED }
})

function upsert(job: Job): void {
  const index = state.jobs.findIndex((j) => j.id === job.id)
  if (index === -1) state.jobs.push(job)
  else state.jobs[index] = job
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
        void window.api.settings.set({ advanced: { ...state.advanced } })
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

export async function addFiles(paths: string[]): Promise<{ added: number; skipped: number }> {
  if (paths.length === 0) return { added: 0, skipped: 0 }
  const { jobs: created, skipped } = await window.api.jobs.enqueue(paths, currentOptions())
  for (const job of created) upsert(job)
  return { added: created.length, skipped }
}

export async function startQueue(): Promise<void> {
  await window.api.jobs.start()
}

/** 勾选等待中的任务准备合并（Vue 3 对 Set 的变更可响应） */
export const selectedIds = reactive(new Set<string>())
export const selectedCount = computed(() => selectedIds.size)

export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

export function clearSelection(): void {
  selectedIds.clear()
}

/** 合并所选任务：主进程移除原任务并新建合并任务，界面同步移除后再插入合并任务 */
export async function mergeSelected(): Promise<number> {
  const ids = [...selectedIds]
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

export function clearFinished(): void {
  state.jobs = state.jobs.filter((job) => job.status === 'queued' || job.status === 'running')
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  state.settings = await window.api.settings.set(patch)
}
