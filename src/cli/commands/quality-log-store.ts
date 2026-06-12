import {
  createWriteStream,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { getSurfacePath } from '#paths/state-root.js'

export const CLI_LOG_COMMANDS = [
  'test',
  'typecheck',
  'qa',
  'audit',
  'e2e',
  'lint',
  'format',
] as const

export type CliLogCommandName = (typeof CLI_LOG_COMMANDS)[number]

export interface CliLogEntry {
  readonly id: string
  readonly command: CliLogCommandName
  readonly timestamp: string
  readonly exitCode: number
  readonly logPath: string
  readonly options?: Record<string, unknown>
  readonly summary?: string
}

interface CliLogIndex {
  readonly version: 1
  readonly command: CliLogCommandName
  readonly entries: readonly CliLogEntry[]
}

export function isCliLogCommandName(value: string): value is CliLogCommandName {
  return (CLI_LOG_COMMANDS as readonly string[]).includes(value)
}

export function createCliLogSink(command: CliLogCommandName, cwd = process.cwd()): CliLogSink {
  const id = createLogId()
  const commandDir = getCommandLogDir(command, cwd)
  mkdirSync(commandDir, { recursive: true })
  const absoluteLogPath = join(commandDir, `${id}.log`)
  const fd = openSync(absoluteLogPath, 'a')
  const stream = createWriteStream(absoluteLogPath, {
    encoding: 'utf8',
    fd,
    flags: 'a',
    autoClose: true,
  })

  return {
    command,
    cwd,
    id,
    absoluteLogPath,
    write(chunk: string): void {
      stream.write(chunk)
    },
    async finalize(metadata): Promise<CliLogEntry> {
      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject)
        stream.end(() => resolve())
      })
      const entry: CliLogEntry = {
        id,
        command,
        timestamp: metadata.timestamp ?? new Date().toISOString(),
        exitCode: metadata.exitCode,
        logPath: absoluteLogPath,
        ...(metadata.options ? { options: metadata.options } : {}),
        ...(metadata.summary ? { summary: metadata.summary } : {}),
      }
      writeLogEntry(entry, cwd)
      return entry
    },
  }
}

export interface CliLogSink {
  readonly command: CliLogCommandName
  readonly cwd: string
  readonly id: string
  readonly absoluteLogPath: string
  write(chunk: string): void
  finalize(metadata: {
    readonly exitCode: number
    readonly summary?: string
    readonly options?: Record<string, unknown>
    readonly timestamp?: string
  }): Promise<CliLogEntry>
}

export function readCliLogEntries(
  command: CliLogCommandName,
  cwd = process.cwd(),
): readonly CliLogEntry[] {
  const indexPath = getCommandIndexPath(command, cwd)
  try {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as CliLogIndex
    return Array.isArray(parsed.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

export function readCliLogEntry(
  command: CliLogCommandName,
  ordinal = 1,
  cwd = process.cwd(),
): CliLogEntry | undefined {
  if (!Number.isInteger(ordinal) || ordinal < 1) return
  return readCliLogEntries(command, cwd)[ordinal - 1]
}

function writeLogEntry(entry: CliLogEntry, cwd: string): void {
  const indexPath = getCommandIndexPath(entry.command, cwd)
  mkdirSync(dirname(indexPath), { recursive: true })

  const currentEntries = readCliLogEntries(entry.command, cwd)
  const nextEntries = [entry, ...currentEntries].slice(0, 10)
  const retainedLogPaths = new Set(nextEntries.map((item) => item.logPath))

  for (const removed of currentEntries.slice(9)) {
    if (!retainedLogPaths.has(removed.logPath)) {
      rmSync(removed.logPath, { force: true })
    }
  }

  pruneOrphanedLogFiles(entry.command, retainedLogPaths, cwd)

  const index: CliLogIndex = {
    version: 1,
    command: entry.command,
    entries: nextEntries,
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

function pruneOrphanedLogFiles(
  command: CliLogCommandName,
  retainedLogPaths: ReadonlySet<string>,
  cwd: string,
): void {
  const directory = getCommandLogDir(command, cwd)
  mkdirSync(directory, { recursive: true })
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.log')) continue
    const absolutePath = join(directory, file)
    if (!retainedLogPaths.has(absolutePath)) {
      rmSync(absolutePath, { force: true })
    }
  }
}

function getCommandLogDir(command: CliLogCommandName, cwd: string): string {
  return getSurfacePath(join('cli-logs', command), 'repo', cwd)
}

function getCommandIndexPath(command: CliLogCommandName, cwd: string): string {
  return join(getCommandLogDir(command, cwd), 'index.json')
}

function createLogId(now = new Date()): string {
  const iso = now.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const entropy = Math.random().toString(36).slice(2, 8)
  return `${iso}-${entropy}`
}
