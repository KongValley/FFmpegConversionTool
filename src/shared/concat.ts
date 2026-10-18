import type { MediaInfo } from './types'

/** concat demuxer 列表文件内容；路径中的单引号按 ffmpeg 规则转义 */
export function concatListContent(paths: string[]): string {
  return paths.map((path) => `file '${path.replace(/'/g, "'\\''")}'\n`).join('')
}

function videoKey(media: MediaInfo): string {
  return `${media.video?.codec ?? ''}|${media.video?.width ?? 0}x${media.video?.height ?? 0}`
}

function audioKey(media: MediaInfo): string {
  return `${media.audio?.codec ?? ''}|${media.audio?.sampleRate ?? 0}|${media.audio?.channels ?? 0}`
}

/** 无损拼接的兼容性检查：返回首个失败原因，全部通过返回 null */
export function concatCompatibilityError(mediaList: (MediaInfo | null)[]): string | null {
  if (mediaList.some((media) => media === null)) return '存在未探测成功的文件，无法合并'
  const list = mediaList as MediaInfo[]
  if (list.some((media) => !media.hasVideo)) return '只能合并包含视频的文件'
  const first = list[0]
  if (list.some((media) => videoKey(media) !== videoKey(first))) {
    return '所选文件的视频编码或分辨率不一致，无法无损合并'
  }
  if (list.some((media) => media.hasAudio !== first.hasAudio)) {
    return '所选文件有的含音频、有的不含，无法无损合并'
  }
  if (first.hasAudio && list.some((media) => audioKey(media) !== audioKey(first))) {
    return '所选文件的音频参数不一致，无法无损合并'
  }
  return null
}
