import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { once } from 'node:events'

export const FFMPEG_ZIP_URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

export interface FfmpegPaths {
  ffmpegPath: string
  ffprobePath: string
}

export interface DownloadAndExtractOptions {
  /** 最终 ffmpeg.exe / ffprobe.exe 所在目录 */
  destDir: string
  /** 临时文件目录（zip 与解压中转） */
  workDir: string
  fetchImpl: typeof fetch
  zipUrl?: string
  /** 本地已有 zip，跳过下载 */
  zipPath?: string | null
  onProgress?: (received: number, total: number | null) => void
}

function findFileRecursive(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, name)
      if (found) return found
    } else if (entry.name.toLowerCase() === name) {
      return full
    }
  }
  return null
}

async function extractZip(zipFile: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  // Win10 自带 bsdtar 3.5（已实测支持 zip），避免引入解压依赖
  const child = spawn('C:\\Windows\\System32\\tar.exe', ['-xf', zipFile, '-C', destDir], { windowsHide: true })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString()
  })
  const [code] = (await once(child, 'close').catch(() => [-1])) as [number | null]
  if (code !== 0) throw new Error(`FFmpeg 解压失败（退出码 ${code}）\n${stderr.slice(-2000)}`)
}

async function downloadFile(
  url: string,
  destFile: string,
  fetchImpl: typeof fetch,
  onProgress?: (received: number, total: number | null) => void
): Promise<void> {
  const res = await fetchImpl(url)
  if (!res.ok || !res.body) throw new Error(`FFmpeg 下载失败：HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || null
  let received = 0
  let lastEmit = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastEmit >= 250 || received === total) {
        lastEmit = now
        onProgress?.(received, total)
      }
      callback(null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(destFile))
  } catch (error) {
    rmSync(destFile, { force: true })
    throw error
  }
}

export async function downloadAndExtract(opts: DownloadAndExtractOptions): Promise<FfmpegPaths> {
  const { destDir, workDir } = opts
  const zipUrl = opts.zipUrl ?? FFMPEG_ZIP_URL
  if (opts.zipPath && !existsSync(opts.zipPath)) throw new Error(`指定的 FFmpeg 压缩包不存在：${opts.zipPath}`)
  mkdirSync(workDir, { recursive: true })
  mkdirSync(destDir, { recursive: true })

  const workZip = join(workDir, 'ffmpeg-download.zip')
  const extracted = join(workDir, 'extract')

  try {
    if (opts.zipPath) {
      await extractZip(opts.zipPath, extracted)
    } else {
      await downloadFile(zipUrl, workZip, opts.fetchImpl, opts.onProgress)
      rmSync(extracted, { recursive: true, force: true })
      await extractZip(workZip, extracted)
    }

    const ffprobeSource = findFileRecursive(extracted, 'ffprobe.exe')
    if (!ffprobeSource) throw new Error('FFmpeg 解压失败：未找到 ffprobe.exe')
    const ffmpegSource = join(ffprobeSource, '..', 'ffmpeg.exe')
    if (!existsSync(ffmpegSource)) throw new Error('FFmpeg 解压失败：未找到 ffmpeg.exe')

    const ffmpegPath = join(destDir, 'ffmpeg.exe')
    const ffprobePath = join(destDir, 'ffprobe.exe')
    copyFileSync(ffmpegSource, ffmpegPath)
    copyFileSync(ffprobeSource, ffprobePath)
    return { ffmpegPath, ffprobePath }
  } finally {
    rmSync(extracted, { recursive: true, force: true })
    rmSync(workZip, { force: true })
  }
}
