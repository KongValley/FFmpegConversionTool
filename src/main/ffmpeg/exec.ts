import { spawn } from 'node:child_process'
import { once } from 'node:events'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

/** 运行子进程并收集输出；超时后强行终止 */
export function runCommand(cmd: string, args: string[], timeoutMs = 30_000): Promise<CommandResult> {
  const { promise, resolve, reject } = Promise.withResolvers<CommandResult>()
  const child = spawn(cmd, args, { windowsHide: true })
  let stdout = ''
  let stderr = ''
  let timer: NodeJS.Timeout | undefined
  if (timeoutMs > 0) timer = setTimeout(() => child.kill(), timeoutMs)
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString()
  })
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString()
  })
  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    resolve({ code: code ?? -1, stdout, stderr })
  })
  return promise
}

/** 终止进程树（Windows），失败静默 */
export async function killTree(pid: number): Promise<void> {
  const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  child.on('error', () => undefined)
  await once(child, 'close').catch(() => undefined)
}
