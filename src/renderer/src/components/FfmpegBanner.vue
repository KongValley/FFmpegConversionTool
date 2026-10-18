<script setup lang="ts">
import { computed } from 'vue'
import { state } from '@renderer/stores/queue'

const nvencLabels = computed(() => {
  const nvenc = state.ffmpeg.nvenc
  if (!nvenc) return []
  const labels: string[] = []
  if (nvenc.h264) labels.push('H.264')
  if (nvenc.hevc) labels.push('H.265')
  if (nvenc.av1) labels.push('AV1')
  return labels
})

const percent = computed(() => Math.round(state.ffmpeg.installProgress ?? 0))

function retry(): void {
  void window.api.ffmpeg.install()
}
</script>

<template>
  <div class="banner" :class="`banner--${state.ffmpeg.status}`">
    <template v-if="state.ffmpeg.status === 'missing' || state.ffmpeg.status === 'installing'">
      <span>正在安装 FFmpeg…</span>
      <div class="banner__track">
        <div class="banner__fill" :style="{ width: `${percent}%` }"></div>
      </div>
      <span class="muted">{{ state.ffmpeg.installProgress === null ? '下载中' : `${percent}%` }}</span>
    </template>
    <template v-else-if="state.ffmpeg.status === 'error'">
      <span class="error-text">FFmpeg 安装失败：{{ state.ffmpeg.error }}</span>
      <button type="button" class="btn btn--small" @click="retry">重试</button>
    </template>
    <template v-else>
      <span>FFmpeg {{ state.ffmpeg.version }}</span>
      <span v-if="nvencLabels.length" class="badge badge--gpu">GPU：NVENC {{ nvencLabels.join(' / ') }}</span>
      <span v-else class="badge">GPU 不可用，使用 CPU</span>
    </template>
  </div>
</template>
