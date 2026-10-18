<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PRESETS } from '@shared/presets'
import type { Resolution } from '@shared/types'
import { state } from '@renderer/stores/queue'

const preset = computed(() => PRESETS[state.settings.presetId])
const isAudio = computed(() => preset.value.kind === 'audio')
const isGif = computed(() => preset.value.kind === 'gif')
const isImage = computed(() => preset.value.kind === 'image')
const isVideo = computed(() => preset.value.kind === 'video')
const audioCopy = computed(() => preset.value.audioCopy === true)
const copyMode = computed(() => isVideo.value && state.advanced.videoCopy)
const showAudio = computed(() => (isVideo.value || isAudio.value) && !audioCopy.value)
const showAudioCodec = computed(() => isVideo.value && preset.value.ext !== 'webm')
const showAudioBitrate = computed(() => {
  const codec = isAudio.value ? preset.value.audioCodec : state.advanced.audioCodec
  return codec === 'aac' || codec === 'libmp3lame' || codec === 'libopus'
})

const isCustomResolution = computed(() => /^\d+x\d+$/.test(state.advanced.resolution))
const customWidth = ref(1280)
const customHeight = ref(720)
if (isCustomResolution.value) {
  const [w, h] = state.advanced.resolution.split('x')
  customWidth.value = Number(w)
  customHeight.value = Number(h)
}

watch([customWidth, customHeight], () => {
  if (isCustomResolution.value) {
    state.advanced.resolution = `${Math.max(2, customWidth.value)}x${Math.max(2, customHeight.value)}` as Resolution
  }
})

const resolutionChoice = computed({
  get: () => (isCustomResolution.value ? 'custom' : state.advanced.resolution),
  set: (value: string) => {
    state.advanced.resolution = (value === 'custom' ? `${customWidth.value}x${customHeight.value}` : value) as Resolution
  }
})

const fpsInput = ref(state.advanced.fps === null ? '' : String(state.advanced.fps))
watch(fpsInput, (value) => {
  const n = Number(value)
  state.advanced.fps = value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
})
</script>

<template>
  <details class="advanced">
    <summary class="advanced__summary">高级参数</summary>

    <div v-if="isVideo" class="field">
      <span class="field__label">视频编码</span>
      <label class="radio">
        <input v-model="state.advanced.videoCopy" type="checkbox" />
        <span>复制视频流（不重编码，失败自动重新编码）</span>
      </label>
      <span v-if="copyMode" class="field__hint muted">复制模式不支持缩放/改帧率，分包速度取决于磁盘</span>
      <span v-else class="field__hint muted">勾选后仅换容器，秒级完成；目标容器必须支持源编码</span>
    </div>

    <div v-if="isVideo" class="field">
      <span class="field__label">码率模式</span>
      <label class="radio">
        <input v-model="state.advanced.rateMode" type="radio" value="quality" :disabled="copyMode" />
        <span>质量优先</span>
      </label>
      <label class="radio">
        <input v-model="state.advanced.rateMode" type="radio" value="bitrate" :disabled="copyMode" />
        <span>指定码率</span>
      </label>
      <input
        v-model.number="state.advanced.videoBitrateKbps"
        class="input input--number"
        type="number"
        min="100"
        step="100"
        :disabled="copyMode || state.advanced.rateMode !== 'bitrate'"
      />
      <span class="muted">kbps</span>
    </div>

    <div v-if="isImage" class="field">
      <span class="field__label">导出方式</span>
      <select v-model="state.advanced.imageMode" class="input">
        <option value="single">单帧（指定时间点）</option>
        <option value="sequence">按间隔导出序列</option>
      </select>
      <div v-if="state.advanced.imageMode === 'single'" class="field__row">
        <span class="muted">时间点</span>
        <input v-model.number="state.advanced.imageTimeSec" class="input input--number" type="number" min="0" step="0.1" />
        <span class="muted">秒</span>
      </div>
      <div v-else class="field__row">
        <span class="muted">间隔</span>
        <input
          v-model.number="state.advanced.imageIntervalSec"
          class="input input--number"
          type="number"
          min="1"
          step="1"
        />
        <span class="muted">秒（整数）</span>
      </div>
      <span v-if="state.advanced.imageMode === 'sequence'" class="field__hint muted">
        输出到 &lt;原名&gt;_converted_frames 目录，文件从 0001 起编号
      </span>
    </div>

    <label class="field">
      <span class="field__label">{{ isGif ? '宽度' : '分辨率' }}</span>
      <select v-model="resolutionChoice" class="input" :disabled="copyMode">
        <option value="source">{{ isGif ? '480（默认）' : '保持源' }}</option>
        <option v-if="!isGif" value="2160p">2160p</option>
        <option v-if="!isGif" value="1080p">1080p</option>
        <option v-if="!isGif" value="720p">720p</option>
        <option value="480p">480p</option>
        <option value="custom">自定义</option>
      </select>
      <div v-if="isCustomResolution" class="field__row">
        <input v-model.number="customWidth" class="input input--number" type="number" min="2" step="2" :disabled="copyMode" />
        <span class="muted">×</span>
        <input v-model.number="customHeight" class="input input--number" type="number" min="2" step="2" :disabled="copyMode" />
      </div>
    </label>

    <label v-if="isVideo" class="field">
      <span class="field__label">帧率</span>
      <input
        v-model="fpsInput"
        class="input input--number"
        type="number"
        min="1"
        max="240"
        placeholder="保持源帧率"
        :disabled="copyMode"
      />
    </label>

    <span v-if="audioCopy" class="field__hint muted">直接复制源音轨，不重新编码</span>

    <template v-if="showAudio">
      <label v-if="showAudioCodec" class="field">
        <span class="field__label">音频编码</span>
        <select v-model="state.advanced.audioCodec" class="input">
          <option value="auto">自动</option>
          <option value="aac">AAC</option>
          <option value="libmp3lame">MP3</option>
          <option value="libopus">Opus</option>
        </select>
      </label>

      <label v-if="showAudioBitrate" class="field">
        <span class="field__label">音频码率</span>
        <input v-model.number="state.advanced.audioBitrateKbps" class="input input--number" type="number" min="32" step="32" />
        <span class="muted">kbps</span>
      </label>

      <label class="field">
        <span class="field__label">声道</span>
        <select v-model="state.advanced.channels" class="input">
          <option value="source">保持源</option>
          <option value="2">立体声</option>
          <option value="1">单声道</option>
        </select>
      </label>

      <label class="field">
        <span class="field__label">采样率</span>
        <select v-model="state.advanced.sampleRate" class="input">
          <option :value="null">保持源</option>
          <option :value="44100">44100 Hz</option>
          <option :value="48000">48000 Hz</option>
        </select>
      </label>
    </template>

    <div v-if="isVideo && !copyMode" class="field">
      <span class="field__label">GPU 解码</span>
      <label class="radio">
        <input v-model="state.advanced.hwaccel" type="checkbox" />
        <span>启用 CUDA 硬件解码（-hwaccel cuda）</span>
      </label>
      <span class="field__hint muted">仅 NVDEC 支持的编码有效，失败请关闭后重新添加文件</span>
    </div>

    <label class="field">
      <span class="field__label">额外 FFmpeg 参数</span>
      <input v-model="state.advanced.extraArgs" class="input" type="text" placeholder="空格分隔，不支持引号" />
    </label>
  </details>
</template>
