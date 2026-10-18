import type { EncodeOptions, FfmpegState, Job, Settings } from './types'

/** preload 暴露给渲染进程的 API 契约 */
export interface MediaConverterApi {
  ffmpeg: {
    getState(): Promise<FfmpegState>
    install(): Promise<void>
    onState(callback: (state: FfmpegState) => void): () => void
  }
  jobs: {
    enqueue(paths: string[], options: EncodeOptions): Promise<{ jobs: Job[]; skipped: number }>
    merge(ids: string[], options: EncodeOptions): Promise<Job>
    start(): Promise<void>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    retry(id: string): Promise<Job | null>
    onUpdate(callback: (job: Job) => void): () => void
  }
  dialog: {
    pickFiles(): Promise<string[]>
    pickDir(): Promise<string | null>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  reveal(path: string): Promise<void>
  appVersion(): Promise<string>
  getPathForFile(file: File): string
}
