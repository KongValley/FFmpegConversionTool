/** 对话框过滤器、拖入扫描共用同一份扩展名清单 */
export const MEDIA_EXTENSIONS = [
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm',
  'flv',
  'ts',
  'm3u8',
  'm3u',
  'm4v',
  'mp3',
  'wav',
  'flac',
  'aac',
  'm4a',
  'ogg',
  'opus',
  'gif'
]

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function isMediaFile(fileName: string): boolean {
  return MEDIA_EXTENSIONS.includes(extensionOf(fileName))
}

/** HLS 播放列表：需要放开协议白名单，否则引用网络分片时会被拒绝 */
export function isPlaylistPath(filePath: string): boolean {
  const ext = extensionOf(filePath)
  return ext === 'm3u8' || ext === 'm3u'
}
