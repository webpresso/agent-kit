import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { WriteStream } from 'node:tty'

import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

export interface HookErrorEntry {
  readonly timestamp: string
  readonly binName: string
  readonly hookName: string
  readonly event: string
  readonly phase: string
  readonly fallback: string
  readonly status?: number
  readonly signal?: string
  readonly detail?: string
}

interface HookErrorIndex {
  readonly version: 1
  readonly entries: readonly HookErrorEntry[]
}

export interface HooksErrorsOptions {
  readonly json?: boolean
  readonly limit?: number
  readonly cwd?: string
}

export interface RecordHookErrorInput {
  readonly binName: string
  readonly hookName: string
  readonly event: string
  readonly phase: string
  readonly fallback: string
  readonly status?: number
  readonly signal?: string
  readonly detail?: string
}

const DEFAULT_LIMIT = 10
const MAX_ERROR_ENTRIES = 50

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function resolveHookErrorsPath(cwd = process.cwd()): string {
  if (process.env.WP_HOOK_ERRORS_PATH) return process.env.WP_HOOK_ERRORS_PATH
  try {
    return getSurfacePath('hook-errors.json', 'repo', cwd)
  } catch (error) {
    if (!(error instanceof NotInGitRepoError)) throw error
    return getSurfacePath('hook-errors.json', 'user')
  }
}

export function readHookErrors(cwd = process.cwd()): readonly HookErrorEntry[] {
  const indexPath = resolveHookErrorsPath(cwd)
  if (!existsSync(indexPath)) return []

  try {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as Partial<HookErrorIndex>
    return Array.isArray(parsed.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

function readHookErrorIndex(cwd = process.cwd()): HookErrorIndex {
  return { version: 1, entries: readHookErrors(cwd) }
}

function writeHookErrorIndex(indexPath: string, index: HookErrorIndex): void {
  mkdirSync(dirname(indexPath), { recursive: true })
  const tempPath = `${indexPath}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  renameSync(tempPath, indexPath)
}

export function recordHookError(input: RecordHookErrorInput, cwd = process.cwd()): void {
  try {
    const indexPath = resolveHookErrorsPath(cwd)
    const index = readHookErrorIndex(cwd)
    const entry: HookErrorEntry = {
      timestamp: new Date().toISOString(),
      binName: input.binName,
      hookName: input.hookName,
      event: input.event,
      phase: input.phase,
      fallback: input.fallback,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    }
    writeHookErrorIndex(indexPath, {
      version: 1,
      entries: [entry, ...index.entries].slice(0, MAX_ERROR_ENTRIES),
    })
  } catch {
    // Hook error recording is diagnostic-only. Event-specific fallbacks must
    // still run even when the recorder cannot write to disk.
  }
}

function formatStatus(entry: HookErrorEntry): string {
  if (entry.signal) return `signal=${entry.signal}`
  if (entry.status !== undefined) return `status=${entry.status}`
  return 'status=unknown'
}

export function formatHookErrors(entries: readonly HookErrorEntry[], limit = DEFAULT_LIMIT): string {
  const shown = entries.slice(0, limit)
  if (shown.length === 0) {
    return 'wp hooks errors: no managed hook errors recorded for this repo\n'
  }

  const lines = [`wp hooks errors — showing ${shown.length} recent managed hook degradation(s)`]
  for (const entry of shown) {
    const detail = entry.detail ? ` — ${entry.detail}` : ''
    lines.push(
      `- ${entry.timestamp} ${entry.binName} (${entry.event}/${entry.hookName}) ${entry.phase} ${formatStatus(
        entry,
      )} fallback=${entry.fallback}${detail}`,
    )
  }
  return `${lines.join('\n')}\n`
}

export async function hooksErrorsCommand(
  args: readonly string[] = [],
  stdout: Pick<WriteStream, 'write'> = process.stdout,
  options: HooksErrorsOptions = {},
): Promise<void> {
  const json = options.json === true || args.includes('--json')
  const limitFlagIndex = args.indexOf('--limit')
  const limit = options.limit ?? parsePositiveInt(args[limitFlagIndex + 1], DEFAULT_LIMIT)
  const entries = readHookErrors(options.cwd).slice(0, limit)

  if (json) {
    stdout.write(`${JSON.stringify({ version: 1, entries }, null, 2)}\n`)
    return
  }

  stdout.write(formatHookErrors(entries, limit))
}
