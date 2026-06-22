import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { WriteStream } from 'node:tty'

import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

export const HOOK_FALLBACK_ACTIONS = ['fail-closed-deny', 'emit-empty-json', 'fail-open'] as const

export type HookFallbackAction = (typeof HOOK_FALLBACK_ACTIONS)[number]

export type HookErrorEntry = {
  readonly timestamp: string
  readonly binName: string
  readonly hookName: string
  readonly event: string
  readonly phase: string
  readonly fallback: HookFallbackAction
  readonly status?: number
  readonly signal?: string
  readonly detail?: string
}

type HookErrorIndex = {
  readonly version: 1
  readonly entries: readonly HookErrorEntry[]
}

export type RecordHookErrorInput = Omit<HookErrorEntry, 'timestamp'>

export interface HooksErrorsOptions {
  readonly json?: boolean
  readonly limit?: number
  readonly cwd?: string
}

const DEFAULT_LIMIT = 10
const MAX_ERROR_ENTRIES = 50
const MAX_DETAIL_CHARS = 500
let recorderWarningEmitted = false

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function truncateDetail(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= MAX_DETAIL_CHARS) return normalized
  return `${normalized.slice(0, MAX_DETAIL_CHARS)}…`
}

function warnRecorderFailure(error: unknown): void {
  if (recorderWarningEmitted) return
  recorderWarningEmitted = true
  const detail = error instanceof Error ? error.message : String(error ?? '')
  process.stderr.write(`webpresso hook error recorder unavailable: ${detail}\n`)
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

function writeHookErrorIndex(indexPath: string, entries: readonly HookErrorEntry[]): void {
  mkdirSync(dirname(indexPath), { recursive: true })
  const tmpPath = `${indexPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  try {
    writeFileSync(
      tmpPath,
      `${JSON.stringify({ version: 1, entries: entries.slice(0, MAX_ERROR_ENTRIES) }, null, 2)}\n`,
      'utf8',
    )
    renameSync(tmpPath, indexPath)
  } catch (error) {
    rmSync(tmpPath, { force: true })
    throw error
  }
}

export function recordHookError(input: RecordHookErrorInput, cwd = process.cwd()): void {
  try {
    const indexPath = resolveHookErrorsPath(cwd)
    const entries = readHookErrors(cwd)
    const entry: HookErrorEntry = {
      timestamp: new Date().toISOString(),
      binName: input.binName,
      hookName: input.hookName,
      event: input.event,
      phase: input.phase,
      fallback: input.fallback,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.detail === undefined ? {} : { detail: truncateDetail(input.detail) }),
    }
    writeHookErrorIndex(indexPath, [entry, ...entries])
  } catch (error) {
    warnRecorderFailure(error)
  }
}

function formatStatus(entry: HookErrorEntry): string {
  if (entry.signal) return `signal=${entry.signal}`
  if (entry.status !== undefined) return `status=${entry.status}`
  return 'status=unknown'
}

export function formatHookErrors(
  entries: readonly HookErrorEntry[],
  limit = DEFAULT_LIMIT,
): string {
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
