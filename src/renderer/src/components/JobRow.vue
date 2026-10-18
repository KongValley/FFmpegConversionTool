<script setup lang="ts">
import { computed } from 'vue'
import type { Job } from '@shared/types'
import { cancelJob, removeJob, retryJob } from '@renderer/stores/queue'

const props = defineProps<{ job: Job }>()

const STATUS_TEXT: Record<Job['status'], string> = {
  queued: '等待中',
  running: '转换中',
  done: '完成',
  error: '失败',
  canceled: '已取消'
}

const fileName = computed(() => props.job.inputPath.split(/[\\/]/).pop() ?? props.job.inputPath)

const statusText = computed(() => (props.job.status === 'queued' && props.job.error ? '探测失败' : STATUS_TEXT[props.job.status]))

const mediaSummary = computed(() => {
  const media = props.job.media
  if (!media) return props.job.error ?? '未探测'
  const parts: string[] = []
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
  <div class="job" :class="`job--${job.status}`">
    <div class="job__main">
      <div class="job__title">
        <span class="job__name" :title="job.inputPath">{{ fileName }}</span>
        <span class="job__status">{{ statusText }}</span>
      </div>
      <div class="job__meta muted">{{ mediaSummary }}</div>
      <div v-if="job.status === 'running'" class="job__progress">
        <div class="job__track">
          <div
            class="job__fill"
            :class="{ 'job__fill--indeterminate': percent === null }"
            :style="percent === null ? undefined : { width: `${percent}%` }"
          ></div>
        </div>
        <span class="job__percent">{{ percent === null ? '—' : `${percent.toFixed(0)}%` }}</span>
      </div>
      <div v-if="job.status === 'running'" class="job__meta muted">{{ runningDetail }}</div>
      <div v-if="job.usedGpu && job.status !== 'queued'" class="job__meta badge badge--gpu">GPU 编码</div>
      <div v-if="job.fallbackNote" class="job__meta warn-text">{{ job.fallbackNote }}</div>
      <div v-if="job.error" class="job__error error-text">{{ job.error }}</div>
      <div v-if="job.status === 'done'" class="job__meta muted" :title="job.outputPath">输出：{{ outputName }}</div>
    </div>
    <div class="job__actions">
      <button v-if="job.status === 'running' || job.status === 'queued'" type="button" class="btn btn--small" @click="cancelJob(job.id)">
        取消
      </button>
      <button v-if="job.status === 'error'" type="button" class="btn btn--small" @click="retryJob(job.id)">重试</button>
      <button v-if="job.status !== 'running'" type="button" class="btn btn--small" @click="removeJob(job.id)">移除</button>
      <button v-if="job.status === 'done'" type="button" class="btn btn--small" @click="reveal">
        打开所在文件夹
      </button>
    </div>
  </div>
</template>
