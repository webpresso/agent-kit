import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function sentinelPath(): string {
  return join(tmpdir(), `ak-mcp-ready-${process.ppid}`)
}

export function isMcpReady(): boolean {
  if (process.platform === 'win32') return false
  try {
    const pid = parseInt(readFileSync(sentinelPath(), 'utf-8'), 10)
    process.kill(pid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    return false
  }
}

export function writeSentinel(): void {
  writeFileSync(sentinelPath(), String(process.pid), 'utf-8')
}

export function deleteSentinel(): void {
  try {
    unlinkSync(sentinelPath())
  } catch {
    // ignore — sentinel may not exist
  }
}
