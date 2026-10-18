<script setup lang="ts">
import JobRow from './JobRow.vue'
import { state } from '@renderer/stores/queue'
</script>

<template>
  <div class="queue">
    <div v-if="state.jobs.length === 0" class="queue__empty">
      <span class="queue__empty-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18" />
          <path d="m10 13 4.5 2.5L10 18z" />
        </svg>
      </span>
      <span class="queue__empty-title">把文件拖到这里</span>
      <span class="queue__empty-hint">也可以点击“添加文件”。支持视频、音频、m3u8 播放列表与整个文件夹</span>
    </div>
    <JobRow v-for="job in state.jobs" :key="job.id" :job="job" />
  </div>
</template>
