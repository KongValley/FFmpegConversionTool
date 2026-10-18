import type { EncodeOptions, FfmpegState, Job, Settings } from './types'

/** preload 暴露给渲染进程的 API 契约 */
export interface MediaConverterApi {
  ffmpeg: {
    getState(): Promise<FfmpegState>
    install(): Promise<void>
    onState(callback: (state: FfmpegState) => void): () => void
  }
  jobs: {
    enqueue(paths: string[], options: EncodeOptions): Promise<{ jobs: Job[]; skipped: number; duplicates: number }>
    merge(ids: string[], options: EncodeOptions): Promise<Job>
    start(): Promise<void>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    removeMany(ids: string[]): Promise<string[]>
    retry(id: string): Promise<Job | null>
    pause(): Promise<void>
    resume(): Promise<void>
    onUpdate(callback: (job: Job) => void): () => void
    list(): Promise<Job[]>
  }
  dialog: {
    pickFiles(): Promise<string[]>
    pickDir(): Promise<string | null>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<{ settings: Settings; saved: boolean }>
  }
  reveal(path: string): Promise<void>
  appVersion(): Promise<string>
  getPathForFile(file: File): string
}
