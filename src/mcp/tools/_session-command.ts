import { mkdirSync, realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'

import { loadNativeSessionMemoryEngine } from '#session-memory/native-runtime.js'
import { SessionMemoryStore } from '#session-memory/store.js'
import type { SearchHit } from '#session-memory/types.js'
import { defaultIndexDbPath } from './session-restore.js'

const DEFAULT_SEARCH_LIMIT = 10

const nativeExecutionQueues = new Map<string, Promise<void>>()

async function withNativeExecutionQueue<T>(dbPath: string, task: () => Promise<T>): Promise<T> {
  const previous = nativeExecutionQueues.get(dbPath) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.catch(() => {}).then(() => current)
  nativeExecutionQueues.set(dbPath, queued)
  await previous.catch(() => {})
  try {
    return await task()
  } finally {
    release()
    if (nativeExecutionQueues.get(dbPath) === queued) nativeExecutionQueues.delete(dbPath)
  }
}

function assertNativeExecuteResult(value: unknown): asserts value is {
  exitCode: number
  outputBytes: number
  indexed: boolean
  summary: string
} {
  if (value instanceof Error) throw value
  if (typeof value !== 'object' || value === null) {
    throw new Error('native session-memory execute returned a non-object result')
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.exitCode !== 'number' ||
    typeof record.outputBytes !== 'number' ||
    typeof record.indexed !== 'boolean' ||
    typeof record.summary !== 'string'
  ) {
    throw new Error('native session-memory execute returned an invalid result shape')
  }
}

export interface SessionCommandResult {
  readonly label: string
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

interface RunSessionCommandOptions {
  readonly command: string
  readonly label: string
  readonly cwd: string
  readonly projectRoot: string
  readonly timeoutMs: number
  readonly dbPath?: string
}

function isPathInside(child: string, parent: string): boolean {
  if (child === parent) return true
  const parentPrefix = parent.endsWith(sep) ? parent : `${parent}${sep}`
  return child.startsWith(parentPrefix)
}

function isEscaped(command: string, index: number): boolean {
  let backslashes = 0
  for (let i = index - 1; i >= 0 && command[i] === '\\'; i -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function disallowedShellSyntax(command: string): string | null {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (!char) continue

    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false
      continue
    }

    if (inDoubleQuote) {
      if (char === '"' && !isEscaped(command, index)) inDoubleQuote = false
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }
    if (char === '"' && !isEscaped(command, index)) {
      inDoubleQuote = true
      continue
    }
    if (char === '\\') {
      index += 1
      continue
    }

    if (char === '$' && (command[index + 1] === '(' || command[index + 1] === '{')) {
      return command.slice(index, index + 2)
    }
    if (char === '!' && /\S/u.test(command[index + 1] ?? '')) return char
    if (char === '\n' || char === '\r') return 'newline'
    if (
      char === ';' ||
      char === '&' ||
      char === '|' ||
      char === '`' ||
      char === '>' ||
      char === '<'
    ) {
      return char
    }
  }

  return null
}

export function validateCommand(command: string, cwd: string, projectRoot: string): void {
  const realProjectRoot = realpathSync(projectRoot)
  const realCwd = realpathSync(cwd)
  if (!isPathInside(realCwd, realProjectRoot)) {
    throw new Error(`cwd ${cwd} resolves outside trusted project root ${projectRoot}`)
  }

  const syntax = disallowedShellSyntax(command)
  if (syntax) {
    throw new Error(`disallowed shell syntax ${JSON.stringify(syntax)} in session command`)
  }
}

export async function runSessionCommand({
  command,
  label,
  cwd,
  projectRoot,
  timeoutMs,
  dbPath = defaultIndexDbPath(cwd),
}: RunSessionCommandOptions): Promise<SessionCommandResult> {
  validateCommand(command, cwd, projectRoot)
  mkdirSync(dirname(dbPath), { recursive: true })
  const result = await withNativeExecutionQueue(dbPath, () =>
    loadNativeSessionMemoryEngine().executeSandboxed(dbPath, command, label, timeoutMs, cwd),
  )
  assertNativeExecuteResult(result)
  return {
    label,
    exitCode: result.exitCode,
    outputBytes: result.outputBytes,
    indexed: result.indexed,
    summary: result.summary,
  }
}

export function searchSessionCommandOutput(
  dbPath: string,
  labels: readonly string[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): SearchHit[] {
  const store = new SessionMemoryStore(dbPath)
  try {
    const hits = labels.flatMap((label) =>
      store
        .search({ query, limit, source: label })
        .filter((hit) => hit.source === label)
        .map((hit, index) => ({
          content: hit.text,
          source: hit.source,
          rank: index + 1,
          tier: hit.tier,
        })),
    )
    const deduped = new Map<string, SearchHit>()
    for (const hit of hits) {
      const key = `${hit.source}\0${hit.content}`
      if (!deduped.has(key)) deduped.set(key, hit)
    }
    return [...deduped.values()].slice(0, limit)
  } finally {
    store.close()
  }
}
