<script setup lang="ts">
import { computed } from 'vue'
import { PRESETS, PRESET_GROUPS } from '@shared/presets'
import type { PresetId, Quality } from '@shared/types'
import { state, updateSettings } from '@renderer/stores/queue'
import AdvancedPanel from './AdvancedPanel.vue'

const preset = computed(() => PRESETS[state.settings.presetId])
const showQuality = computed(() => preset.value.kind === 'video' || preset.value.kind === 'gif')
const copyMode = computed(() => preset.value.kind === 'video' && state.advanced.videoCopy)
const hwAvailable = computed(() => preset.value.nvenc !== null)
const nvencReady = computed(() => {
  const nvenc = state.ffmpeg.nvenc
  if (!nvenc || !preset.value.nvenc) return false
  if (preset.value.videoCodec === 'h264') return nvenc.h264
  if (preset.value.videoCodec === 'h265') return nvenc.hevc
  if (preset.value.videoCodec === 'av1') return nvenc.av1
  return false
})

const qualities: { value: Quality; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
]

async function pickDir(): Promise<void> {
  const dir = await window.api.dialog.pickDir()
  if (dir) await updateSettings({ outputMode: 'custom', outputDir: dir })
}

function selectOutputMode(mode: 'source' | 'custom'): void {
  if (mode === 'custom' && !state.settings.outputDir) {
    void pickDir()
    return
  }
  void updateSettings({ outputMode: mode })
}
</script>

<template>
  <div class="settings">
    <div class="settings__header">
      <h2 class="settings__title">转换设置</h2>
    </div>

    <div class="settings__body">
      <label class="field">
        <span class="field__label">目标格式</span>
        <select
          class="input"
          :value="state.settings.presetId"
          @change="updateSettings({ presetId: ($event.target as HTMLSelectElement).value as PresetId })"
        >
          <optgroup v-for="group in PRESET_GROUPS" :key="group.label" :label="group.label">
            <option v-for="item in group.presets" :key="item.id" :value="item.id">{{ item.label }}</option>
          </optgroup>
        </select>
      </label>

      <div v-if="showQuality" class="field">
        <span class="field__label">质量</span>
        <div class="segmented">
          <button
            v-for="item in qualities"
            :key="item.value"
            type="button"
            class="segmented__item"
            :class="{ 'segmented__item--active': state.settings.quality === item.value }"
            :disabled="copyMode"
            @click="updateSettings({ quality: item.value })"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field__label">加速</span>
        <select
          class="input"
          :disabled="!hwAvailable || copyMode"
          :value="state.settings.accel"
          @change="updateSettings({ accel: ($event.target as HTMLSelectElement).value as 'auto' | 'cpu' })"
        >
          <option value="auto">自动（GPU 优先）</option>
          <option value="cpu">仅 CPU</option>
        </select>
        <span v-if="copyMode" class="field__hint muted">复制模式直接封装，不重新编码</span>
        <span v-else-if="!hwAvailable" class="field__hint muted">该格式无硬件编码器</span>
        <span v-else-if="!nvencReady" class="field__hint muted">GPU 不可用，将使用 CPU</span>
        <span v-else class="field__hint muted">将使用 NVENC 硬件编码</span>
      </label>

      <div class="field">
        <span class="field__label">输出目录</span>
        <div class="output-mode">
          <label
            class="output-mode__card"
            :class="{ 'output-mode__card--active': state.settings.outputMode === 'source' }"
          >
            <input
              type="radio"
              name="output-mode"
              :checked="state.settings.outputMode === 'source'"
              @change="selectOutputMode('source')"
            />
            <span>同源目录</span>
          </label>
          <label
            class="output-mode__card"
            :class="{ 'output-mode__card--active': state.settings.outputMode === 'custom' }"
          >
            <input
              type="radio"
              name="output-mode"
              :checked="state.settings.outputMode === 'custom'"
              @change="selectOutputMode('custom')"
            />
            <span>指定目录</span>
          </label>
          <div v-if="state.settings.outputMode === 'custom' && state.settings.outputDir" class="output-mode__path">
            <span :title="state.settings.outputDir">{{ state.settings.outputDir }}</span>
            <button type="button" class="link-btn" @click="pickDir">更改</button>
          </div>
        </div>
      </div>

      <label class="field">
        <span class="field__label">并行转换</span>
        <select
          class="input"
          :value="state.settings.parallel"
          @change="updateSettings({ parallel: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option :value="1">1（串行）</option>
          <option :value="2">2</option>
          <option :value="3">3</option>
          <option :value="4">4</option>
        </select>
        <span class="field__hint muted">并行数 &gt; 1 时同时转换多个文件；NVENC 并发会话受驱动限制，超出的任务会自动回退 CPU</span>
      </label>

      <AdvancedPanel />
    </div>
  </div>
</template>
