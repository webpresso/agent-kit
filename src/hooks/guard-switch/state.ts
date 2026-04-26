import { findRootSync } from '@manypkg/find-root'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function getStateFilePath(): string {
  try {
    const { rootDir } = findRootSync(process.cwd())
    return join(rootDir, '.claude', '.guard-state.json')
  } catch {
    return '/tmp/webpresso-guard-state.json'
  }
}

const STATE_FILE = getStateFilePath()

export function isGuardEnabled(): boolean {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    return data.guardEnabled !== false
  } catch {
    return true
  }
}

export function setGuardEnabled(enabled: boolean): void {
  writeFileSync(STATE_FILE, JSON.stringify({ guardEnabled: enabled }))
}
