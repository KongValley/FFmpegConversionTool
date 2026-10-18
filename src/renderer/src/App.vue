<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FfmpegBanner from './components/FfmpegBanner.vue'
import QueueList from './components/QueueList.vue'
import ConvertSettings from './components/ConvertSettings.vue'
import { PRESETS } from '@shared/presets'
import {
  addFiles,
  allSelected,
  cancelAll,
  clearQueue,
  clearSelection,
  failedCount,
  init,
  mergeSelected,
  pauseAll,
  removeSelected,
  resumeAll,
  retryFailed,
  selectableIds,
  selectedCount,
  selectedQueuedCount,
  startQueue,
  state,
  toggleSelectAll
} from '@renderer/stores/queue'

const errorText = ref('')
const noticeText = ref('')
const dragging = ref(false)
const appVersion = ref('')
let cleanup: (() => void) | null = null
let errorTimer: number | undefined
let noticeTimer: number | undefined
let dragDepth = 0

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  // ipcRenderer.invoke 会给主进程抛出的错误加前缀，界面只显示原始原因
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

function showError(error: unknown): void {
  errorText.value = describe(error)
  window.clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => {
    errorText.value = ''
  }, 5000)
}

function showNotice(text: string): void {
  noticeText.value = text
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    noticeText.value = ''
  }, 4000)
}

const pendingCount = computed(() => state.jobs.filter((job) => job.status === 'queued').length)
const busy = computed(() => state.jobs.some((job) => job.status === 'running'))
const ffmpegReady = computed(() => state.ffmpeg.status === 'ready')
const videoPreset = computed(() => PRESETS[state.settings.presetId].kind === 'video')

/** 按钮与拖放共用的添加流程 */
async function ingest(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  if (!ffmpegReady.value) {
    showError('FFmpeg 正在安装，请稍候')
    return
  }
  try {
    const { added, skipped, duplicates } = await addFiles(paths)
    if (added === 0 && duplicates === 0) {
      showError('未找到可转换的媒体文件')
      return
    }
    const extra =
      skipped > 0 || duplicates > 0
        ? `，跳过 ${skipped + duplicates} 项${duplicates > 0 ? `（其中 ${duplicates} 项已在队列）` : ''}`
        : ''
    showNotice(`已添加 ${added} 项${extra}`)
  } catch (error) {
    showError(error)
  }
}

async function pickFiles(): Promise<void> {
  await ingest(await window.api.dialog.pickFiles())
}

async function start(): Promise<void> {
  clearSelection()
  try {
    await startQueue()
  } catch (error) {
    showError(error)
  }
}

async function merge(): Promise<void> {
  const count = selectedQueuedCount.value
  try {
    await mergeSelected()
    showNotice(`已合并 ${count} 个文件，开始转换`)
  } catch (error) {
    showError(error)
  }
}

async function removeSelectedJobs(): Promise<void> {
  try {
    const count = await removeSelected()
    if (count > 0) showNotice(`已移除 ${count} 项`)
  } catch (error) {
    showError(error)
  }
}

async function clearAllJobs(): Promise<void> {
  try {
    const count = await clearQueue()
    if (count > 0) showNotice(`已清空 ${count} 项（文件未删除）`)
  } catch (error) {
    showError(error)
  }
}

async function retryFailedJobs(): Promise<void> {
  try {
    const count = await retryFailed()
    if (count > 0) showNotice(`已重试 ${count} 项`)
  } catch (error) {
    showError(error)
  }
}

async function togglePause(): Promise<void> {
  try {
    if (state.paused) {
      await resumeAll()
      showNotice('已继续，被暂停的任务从头重跑')
    } else {
      await pauseAll()
      showNotice('已暂停，运行中的任务已退回队列，继续时从头重跑')
    }
  } catch (error) {
    showError(error)
  }
}

function hasFilePayload(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

function onDragEnter(event: DragEvent): void {
  if (!hasFilePayload(event)) return
  dragDepth += 1
  dragging.value = true
}

function onDragOver(event: DragEvent): void {
  if (hasFilePayload(event)) dragging.value = true
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  dragDepth = 0
  dragging.value = false
  const paths = Array.from(event.dataTransfer?.files ?? [])
    .map((file) => {
      try {
        return window.api.getPathForFile(file)
      } catch {
        return ''
      }
    })
    .filter((path) => path !== '')
  await ingest(paths)
}

onMounted(async () => {
  cleanup = await init()
  appVersion.value = await window.api.appVersion()
})
onUnmounted(() => {
  cleanup?.()
  window.clearTimeout(errorTimer)
  window.clearTimeout(noticeTimer)
})
</script>

<template>
  <div
    class="app"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header class="app__header">
      <div class="brand">
        <span class="brand__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
        <h1 class="app__title">音视频转换工具</h1>
        <span v-if="appVersion" class="version-chip">v{{ appVersion }}</span>
      </div>
      <FfmpegBanner />
    </header>

    <div class="app__body">
      <section class="app__main">
        <div class="toolbar">
          <button type="button" class="btn btn--primary" :disabled="!ffmpegReady" @click="pickFiles">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke-linecap="round" />
            </svg>
            添加文件
          </button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!ffmpegReady || pendingCount === 0 || busy || state.paused"
            @click="start"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            开始转换
          </button>
          <button
            type="button"
            class="btn"
            :disabled="selectedQueuedCount < 2 || !ffmpegReady || busy || !videoPreset || state.paused"
            @click="merge"
          >
            合并所选 ({{ selectedQueuedCount }})
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            :disabled="!busy && pendingCount === 0"
            @click="cancelAll"
          >
            取消全部
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            :disabled="!state.paused && !busy && pendingCount === 0"
            @click="togglePause"
          >
            {{ state.paused ? '继续队列' : '暂停全部' }}
          </button>
          <span class="toolbar__spacer"></span>
          <span class="count-chip">队列 {{ state.jobs.length }} 项</span>
        </div>
        <div v-if="errorText" class="alert">{{ errorText }}</div>
        <div v-if="noticeText" class="notice">{{ noticeText }}</div>
        <div v-if="!state.settingsSaved" class="alert">设置未能写入磁盘（目录只读或空间不足），本次修改仅当前会话有效</div>
        <div v-if="state.jobs.length > 0" class="queue__bar">
          <label class="queue__select-all">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="!allSelected && selectedCount > 0"
              @change="toggleSelectAll"
            />
            <span>全选（{{ selectedCount }}/{{ selectableIds.length }}）</span>
          </label>
          <span class="queue__bar-spacer"></span>
          <button v-if="failedCount > 0" type="button" class="btn btn--small" @click="retryFailedJobs">
            重试全部失败 ({{ failedCount }})
          </button>
          <button
            type="button"
            class="btn btn--small btn--ghost"
            :disabled="selectedCount === 0"
            @click="removeSelectedJobs"
          >
            移除所选 ({{ selectedCount }})
          </button>
          <button
            type="button"
            class="btn btn--small btn--ghost"
            :disabled="selectableIds.length === 0"
            title="只移除列表，不删除已转换的文件；运行中的任务会继续转换"
            @click="clearAllJobs"
          >
            清空队列
          </button>
        </div>
        <QueueList />
      </section>

      <aside class="app__side">
        <ConvertSettings />
      </aside>
    </div>

    <div v-if="dragging" class="drop-overlay">
      <div class="drop-overlay__card">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v10" />
          <path d="m7 11 5 5 5-5" />
          <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        </svg>
        <span>松开以添加文件或文件夹</span>
        <span class="drop-overlay__hint">支持视频、音频、m3u8 播放列表与整个文件夹</span>
      </div>
    </div>
  </div>
</template>
