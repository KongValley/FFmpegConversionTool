<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '@shared/types'
import { cancelJob, removeJob, retryJob, selectedIds, toggleSelection } from '@renderer/stores/queue'

const props = defineProps<{ job: Job }>()

const STATUS_TEXT: Record<Job['status'], string> = {
  queued: '等待中',
  running: '转换中',
  done: '完成',
  error: '失败',
  canceled: '已取消'
}

const fileName = computed(() => props.job.inputPath.split(/[\\/]/).pop() ?? props.job.inputPath)

const statusText = computed(() =>
  props.job.status === 'queued' && props.job.error ? '探测失败' : STATUS_TEXT[props.job.status]
)

const pillClass = computed(() =>
  props.job.status === 'queued' && props.job.error ? 'pill--error' : `pill--${props.job.status}`
)

const mediaSummary = computed(() => {
  const parts: string[] = []
  if (props.job.mergeInputs) parts.push(`合并 ${props.job.mergeInputs.length} 个文件`)
  const media = props.job.media
  if (media) {
    if (media.durationMs !== null) {
      const total = Math.round(media.durationMs / 1000)
      const mm = String(Math.floor(total / 60)).padStart(2, '0')
      const ss = String(total % 60).padStart(2, '0')
      parts.push(`${mm}:${ss}`)
    }
    if (media.video) {
      parts.push(`${media.video.width}×${media.video.height}`)
      parts.push(media.video.codec)
    }
    if (media.audio) parts.push(media.audio.codec)
  }
  return parts.join(' · ')
})

const percent = computed(() => props.job.progress.percent)

const runningDetail = computed(() => {
  const { speed, etaSec, fps } = props.job.progress
  const parts: string[] = []
  if (fps !== null) parts.push(`${Math.round(fps)} fps`)
  if (speed) parts.push(speed)
  if (etaSec !== null) {
    const total = Math.round(etaSec)
    parts.push(`剩余 ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`)
  }
  return parts.join(' · ')
})

const outputName = computed(() => props.job.outputPath.split(/[\\/]/).pop() ?? props.job.outputPath)

function reveal(): void {
  void window.api.reveal(props.job.outputPath)
}
</script>

<template>
  <article class="job" :class="`job--${job.status}`">
    <div class="job__main">
      <div class="job__head">
        <span class="job__name" :title="job.inputPath">{{ fileName }}</span>
        <span class="pill" :class="pillClass">{{ statusText }}</span>
        <input
          v-if="job.status === 'queued'"
          class="job__select"
          type="checkbox"
          :checked="selectedIds.has(job.id)"
          :aria-label="'选择 ' + fileName"
          @change="toggleSelection(job.id)"
        />
      </div>
      <div v-if="mediaSummary" class="job__meta">{{ mediaSummary }}</div>

      <div v-if="job.status === 'running'" class="job__progress">
        <div class="job__track">
          <div
            class="job__fill"
            :class="{ 'job__fill--indeterminate': percent === null }"
            :style="percent === null ? undefined : { width: `${percent}%` }"
          ></div>
        </div>
        <span class="job__percent">{{ percent === null ? '—' : `${Math.round(percent)}%` }}</span>
      </div>

      <div v-if="job.status !== 'queued'" class="job__foot">
        <span v-if="job.status === 'running' && runningDetail" class="badge">{{ runningDetail }}</span>
        <span v-if="job.usedGpu" class="badge badge--gpu">GPU</span>
        <span v-if="job.fallbackNote" class="warn-text">{{ job.fallbackNote }}</span>
        <span v-if="job.status === 'done'" class="job__output" :title="job.outputPath">→ {{ outputName }}</span>
      </div>

      <div v-if="job.error" class="job__error">{{ job.error }}</div>
    </div>

    <div class="job__actions">
      <button
        v-if="job.status === 'running' || job.status === 'queued'"
        type="button"
        class="btn btn--small"
        @click="cancelJob(job.id)"
      >
        取消
      </button>
      <button v-if="job.status === 'error'" type="button" class="btn btn--small" @click="retryJob(job.id)">重试</button>
      <button
        v-if="job.status !== 'running'"
        type="button"
        class="btn btn--small btn--ghost"
        @click="removeJob(job.id)"
      >
        移除
      </button>
      <button v-if="job.status === 'done'" type="button" class="btn btn--small" @click="reveal">打开文件夹</button>
    </div>
  </article>
</template>
