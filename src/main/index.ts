import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { MEDIA_EXTENSIONS } from '../shared/media'
import type { EncodeOptions, FfmpegState, Settings } from '../shared/types'
import { ensureInstalled, getVersion, isInstalled, probeCapabilities } from './ffmpeg/manager'
import {
  cancelJob,
  enqueueJobs,
  getQueueProgress,
  removeJob,
  retryJob,
  setDrainListener,
  setJobListener,
  startQueue,
  type DrainSummary
} from './jobs'
import { getSettings, setSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let installRunning = false
let ffmpegState: FfmpegState = {
  status: 'missing',
  version: null,
  installProgress: null,
  error: null,
  nvenc: null
}

function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function setFfmpegState(patch: Partial<FfmpegState>): void {
  ffmpegState = { ...ffmpegState, ...patch }
  broadcast(IPC.ffmpegState, ffmpegState)
}

async function runInstall(): Promise<void> {
  if (installRunning) return
  installRunning = true
  try {
    setFfmpegState({ status: 'installing', installProgress: 0, error: null })
    await ensureInstalled((received, total) => {
      setFfmpegState({ installProgress: total ? Math.round((received / total) * 100) : null })
    })
    await refreshReadyState()
  } catch (error) {
    setFfmpegState({
      status: 'error',
      installProgress: null,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    installRunning = false
  }
}

async function refreshReadyState(): Promise<void> {
  if (!isInstalled()) {
    setFfmpegState({ status: 'missing', version: null, nvenc: null })
    return
  }
  const version = await getVersion()
  const nvenc = await probeCapabilities()
  setFfmpegState({ status: 'ready', version, nvenc, installProgress: null, error: null })
}

function notifyDrain(summary: DrainSummary): void {
  if (!Notification.isSupported()) return
  const body = [`成功 ${summary.done}，失败 ${summary.failed}`]
  if (summary.canceled > 0) body.push(`，取消 ${summary.canceled}`)
  if (summary.firstFailed) body.push(`\n失败：${summary.firstFailed}`)
  const notification = new Notification({
    title: summary.failed > 0 ? '转换结束（有失败）' : '转换完成',
    body: body.join('')
  })
  notification.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  notification.show()
}

function registerIpc(): void {
  ipcMain.handle(IPC.ffmpegGetState, () => ffmpegState)
  ipcMain.handle(IPC.ffmpegInstall, () => {
    void runInstall()
  })
  ipcMain.handle(IPC.jobsEnqueue, (_event, paths: string[], options: EncodeOptions) => enqueueJobs(paths, options))
  ipcMain.handle(IPC.jobsStart, () => {
    void startQueue()
  })
  ipcMain.handle(IPC.jobsCancel, (_event, id: string) => cancelJob(id))
  ipcMain.handle(IPC.jobsRemove, (_event, id: string) => removeJob(id))
  ipcMain.handle(IPC.jobsRetry, (_event, id: string) => retryJob(id))
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.dialogPickFiles, async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '媒体文件', extensions: MEDIA_EXTENSIONS }]
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(IPC.dialogPickDir, async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_event, patch: Partial<Settings>) => setSettings(patch))
  ipcMain.handle(IPC.shellReveal, (_event, path: string) => shell.showItemInFolder(path))
}

function createWindow(): void {
  const saved = getSettings().window
  const width = saved ? Math.max(980, Math.min(saved.width, 4000)) : 1180
  const height = saved ? Math.max(640, Math.min(saved.height, 4000)) : 780
  const position =
    saved && typeof saved.x === 'number' && typeof saved.y === 'number' ? { x: saved.x, y: saved.y } : {}
  mainWindow = new BrowserWindow({
    width,
    height,
    ...position,
    minWidth: 980,
    minHeight: 640,
    title: '音视频转换工具',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', () => {
    const bounds = mainWindow?.getNormalBounds()
    if (bounds) setSettings({ window: { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y } })
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setPath('userData', join(app.getPath('appData'), 'media-converter'))

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.media-converter')
  Menu.setApplicationMenu(null)
  setJobListener((job) => {
    broadcast(IPC.jobsUpdate, job)
    const progress = getQueueProgress()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(progress ? progress.percent / 100 : -1)
    }
  })
  setDrainListener((summary) => {
    if (mainWindow && !mainWindow.isFocused()) notifyDrain(summary)
  })
  registerIpc()
  createWindow()
  if (isInstalled()) {
    void refreshReadyState()
  } else {
    void runInstall()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
