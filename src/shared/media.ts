/** 对话框过滤器、拖入扫描共用同一份扩展名清单 */
export const MEDIA_EXTENSIONS = [
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm',
  'flv',
  'ts',
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

export function isMediaFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return false
  return MEDIA_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase())
}
