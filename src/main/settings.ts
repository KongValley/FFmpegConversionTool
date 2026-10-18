import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mergeSettings } from '../shared/settings'
import type { Settings } from '../shared/types'

export function getSettings(): Settings {
  try {
    const raw = readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')
    return mergeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch {
    return mergeSettings(null)
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  try {
    const file = join(app.getPath('userData'), 'settings.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('写入设置失败', error)
  }
  return next
}
