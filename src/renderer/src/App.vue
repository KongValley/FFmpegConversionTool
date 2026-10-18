<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FfmpegBanner from './components/FfmpegBanner.vue'
import QueueList from './components/QueueList.vue'
import ConvertSettings from './components/ConvertSettings.vue'
import { addFiles, cancelAll, clearFinished, init, startQueue, state } from '@renderer/stores/queue'

const errorText = ref('')
const noticeText = ref('')
const dragging = ref(false)
const appVersion = ref('')
let cleanup: (() => void) | null = null
let errorTimer: number | undefined
let noticeTimer: number | undefined
let dragDepth = 0

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

/** 按钮与拖放共用的添加流程 */
async function ingest(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  if (!ffmpegReady.value) {
    showError('FFmpeg 正在安装，请稍候')
    return
  }
  try {
    const { added, skipped } = await addFiles(paths)
    if (added === 0) {
      showError('未找到可转换的媒体文件')
      return
    }
    showNotice(skipped > 0 ? `已添加 ${added} 项，跳过 ${skipped} 项` : `已添加 ${added} 项`)
  } catch (error) {
    showError(error)
  }
}

async function pickFiles(): Promise<void> {
  await ingest(await window.api.dialog.pickFiles())
}

async function start(): Promise<void> {
  try {
    await startQueue()
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
      <h1 class="app__title">音视频转换工具</h1>
      <span v-if="appVersion" class="muted">v{{ appVersion }}</span>
      <FfmpegBanner />
    </header>

    <div class="app__body">
      <section class="app__main">
        <div class="toolbar">
          <button type="button" class="btn btn--primary" :disabled="!ffmpegReady" @click="pickFiles">添加文件</button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!ffmpegReady || pendingCount === 0 || busy"
            @click="start"
          >
            开始转换
          </button>
          <button type="button" class="btn" :disabled="!busy" @click="cancelAll">取消全部</button>
          <button type="button" class="btn" @click="clearFinished">清空已完成</button>
          <span class="toolbar__spacer"></span>
          <span class="muted">队列 {{ state.jobs.length }} 项</span>
        </div>
        <div v-if="errorText" class="alert">{{ errorText }}</div>
        <div v-if="noticeText" class="notice">{{ noticeText }}</div>
        <QueueList />
      </section>

      <aside class="app__side">
        <ConvertSettings />
      </aside>
    </div>

    <div v-if="dragging" class="drop-overlay">松开鼠标以添加文件或文件夹</div>
  </div>
</template>
