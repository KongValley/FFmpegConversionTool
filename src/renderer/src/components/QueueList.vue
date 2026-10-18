<script setup lang="ts">
import JobRow from './JobRow.vue'
import { state } from '@renderer/stores/queue'
</script>

<template>
  <div class="queue">
    <div v-if="state.jobs.length === 0" class="queue__empty muted">
      拖入音视频文件，或点击“添加文件”
    </div>
    <JobRow v-for="job in state.jobs" :key="job.id" :job="job" />
  </div>
</template>
