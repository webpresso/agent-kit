import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { getSurfacePath } from '#paths/state-root.js'

export type LogStatus = 'PASS' | 'BLOCK' | 'WARN' | 'ERROR'
export type ToolType = 'Bash' | 'Write' | 'Edit'

export interface LogEntry {
  status: LogStatus
  target: string
  tool: ToolType
  failures?: string[]
  error?: string
}

export interface LogConfig {
  logDir: string
  logFile: string
  enabled: boolean
  maxLines: number
}

export interface ParsedLogLine {
  timestamp: string
  status: LogStatus
  tool: ToolType
  target: string
  failures?: string[]
  error?: string
}

const DEFAULT_MAX_LINES = 250

export function createLogConfig(): LogConfig {
  try {
    const logFile = process.env.PRETOOL_LOG_DIR
      ? `${process.env.PRETOOL_LOG_DIR}/pretool-guard.log`
      : getSurfacePath('hooks/worktree/pretool-guard.log', 'worktree')
    return {
      logDir: dirname(logFile),
      logFile,
      enabled: process.env.PRETOOL_LOG !== '0',
      maxLines: DEFAULT_MAX_LINES,
    }
  } catch {
    return { logDir: '', logFile: '', enabled: false, maxLines: DEFAULT_MAX_LINES }
  }
}

export function formatLogLine(entry: LogEntry, timestamp: string): string {
  const failures = entry.failures?.length ? ` failures=[${entry.failures.join(',')}]` : ''
  const error = entry.error ? ` error="${entry.error.slice(0, 100)}"` : ''
  return `${timestamp} ${entry.status} ${entry.tool} target="${entry.target}"${failures}${error}`
}

export function parseLogLine(line: string): ParsedLogLine | null {
  const match = line.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(PASS|BLOCK|WARN|ERROR)\s+(Bash|Write|Edit)\s+target="([^"]*)"(?:\s+failures=\[([^\]]*)\])?(?:\s+error="([^"]*)")?$/,
  )
  if (!match) return null
  const [, timestamp, status, tool, target, failuresStr, error] = match
  if (!timestamp || !status || !tool || target === undefined) return null
  return {
    timestamp,
    status: status as LogStatus,
    tool: tool as ToolType,
    target,
    failures: failuresStr ? failuresStr.split(',').filter(Boolean) : undefined,
    error: error || undefined,
  }
}

export function rotateLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines
  return lines.slice(-maxLines)
}

export function readLogLines(logFile: string): string[] {
  if (!existsSync(logFile)) return []
  try {
    return readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export function writeLogLines(logFile: string, logDir: string, lines: string[]): void {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  writeFileSync(logFile, `${lines.join('\n')}\n`)
}

export function logRun(entry: LogEntry, config: LogConfig = createLogConfig()): void {
  if (!config.enabled) return
  try {
    const timestamp = new Date().toISOString()
    const line = formatLogLine(entry, timestamp)
    let lines = readLogLines(config.logFile)
    lines.push(line)
    lines = rotateLines(lines, config.maxLines)
    writeLogLines(config.logFile, config.logDir, lines)
  } catch {
    // Never block the hook on logging errors
  }
}

export function readLogs(config: LogConfig = createLogConfig()): ParsedLogLine[] {
  return readLogLines(config.logFile)
    .map(parseLogLine)
    .filter((e): e is ParsedLogLine => e !== null)
}
