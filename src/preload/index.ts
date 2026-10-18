import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type { MediaConverterApi } from '../shared/api'
import type { EncodeOptions, FfmpegState, Job, Settings } from '../shared/types'

const on = <T>(channel: string, callback: (payload: T) => void): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MediaConverterApi = {
  ffmpeg: {
    getState: () => ipcRenderer.invoke(IPC.ffmpegGetState) as Promise<FfmpegState>,
    install: () => ipcRenderer.invoke(IPC.ffmpegInstall) as Promise<void>,
    onState: (callback) => on<FfmpegState>(IPC.ffmpegState, callback)
  },
  jobs: {
    enqueue: (paths: string[], options: EncodeOptions) =>
      ipcRenderer.invoke(IPC.jobsEnqueue, paths, options) as Promise<{ jobs: Job[]; skipped: number }>,
    merge: (ids: string[], options: EncodeOptions) => ipcRenderer.invoke(IPC.jobsMerge, ids, options) as Promise<Job>,
    start: () => ipcRenderer.invoke(IPC.jobsStart) as Promise<void>,
    cancel: (id: string) => ipcRenderer.invoke(IPC.jobsCancel, id) as Promise<void>,
    remove: (id: string) => ipcRenderer.invoke(IPC.jobsRemove, id) as Promise<void>,
    retry: (id: string) => ipcRenderer.invoke(IPC.jobsRetry, id) as Promise<Job | null>,
    onUpdate: (callback) => on<Job>(IPC.jobsUpdate, callback)
  },
  dialog: {
    pickFiles: () => ipcRenderer.invoke(IPC.dialogPickFiles) as Promise<string[]>,
    pickDir: () => ipcRenderer.invoke(IPC.dialogPickDir) as Promise<string | null>
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
    set: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsSet, patch) as Promise<Settings>
  },
  reveal: (path: string) => ipcRenderer.invoke(IPC.shellReveal, path) as Promise<void>,
  appVersion: () => ipcRenderer.invoke(IPC.appGetVersion) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
