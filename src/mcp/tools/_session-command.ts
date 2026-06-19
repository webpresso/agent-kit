import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'

import {
  NativeSessionMemoryUnavailableError,
  loadNativeSessionMemoryEngine,
} from '#session-memory/native-runtime.js'
import { SessionMemoryStore } from '#session-memory/store.js'
import type { SearchHit } from '#session-memory/types.js'
import { defaultIndexDbPath } from './session-restore.js'

export const MAX_CAPTURE_BYTES = 1024 * 1024
const DEFAULT_SEARCH_LIMIT = 10

const COMMON_SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGSEGV: 11,
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
}

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
  truncated: boolean
  capturedBytes: number
  maxCaptureBytes: number
  timedOut: boolean
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
    typeof record.summary !== 'string' ||
    typeof record.truncated !== 'boolean' ||
    typeof record.capturedBytes !== 'number' ||
    typeof record.maxCaptureBytes !== 'number' ||
    typeof record.timedOut !== 'boolean'
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
  readonly backend: 'native' | 'typescript'
  readonly fallbackReason?: string
  readonly truncated?: boolean
  readonly capturedBytes?: number
  readonly maxCaptureBytes?: number
  readonly timedOut?: boolean
  readonly signal?: NodeJS.Signals
}

interface RunSessionCommandOptions {
  readonly command: string
  readonly label: string
  readonly cwd: string
  readonly projectRoot: string
  readonly timeoutMs: number
  readonly dbPath?: string
}

function appendBounded(parts: Buffer[], chunk: Buffer, currentBytes: number): number {
  const nextBytes = currentBytes + chunk.length
  if (currentBytes >= MAX_CAPTURE_BYTES) return nextBytes
  const remaining = MAX_CAPTURE_BYTES - currentBytes
  parts.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining))
  return nextBytes
}

function summarizeOutput(output: string, timedOut: boolean): string {
  const normalized = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n')
  if (!normalized) return timedOut ? 'command timed out with no captured output' : 'no output'
  return normalized.length > 2_000 ? `${normalized.slice(0, 2_000)}…` : normalized
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

function commandChunkId(label: string, command: string, output: string): string {
  return createHash('sha256')
    .update(label)
    .update('\0')
    .update(command)
    .update('\0')
    .update(output)
    .digest('hex')
    .slice(0, 32)
}

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return -1
  return 128 + (COMMON_SIGNAL_NUMBERS[signal] ?? 15)
}

function terminateChildProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall through to child.kill; the process may have exited between timer and signal.
    }
  }
  child.kill(signal)
}

async function runTypeScriptSessionCommand({
  command,
  label,
  cwd,
  timeoutMs,
  dbPath,
  fallbackReason,
}: RunSessionCommandOptions & {
  dbPath: string
  fallbackReason: string
}): Promise<SessionCommandResult> {
  const captured: Buffer[] = []
  let totalOutputBytes = 0
  let timedOut = false
  let closeSignal: NodeJS.Signals | null = null

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let closed = false
    const timer = setTimeout(() => {
      timedOut = true
      terminateChildProcessTree(child, 'SIGTERM')
      setTimeout(() => {
        if (!closed) terminateChildProcessTree(child, 'SIGKILL')
      }, 1_000).unref()
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      totalOutputBytes = appendBounded(captured, chunk, totalOutputBytes)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      totalOutputBytes = appendBounded(captured, chunk, totalOutputBytes)
    })
    child.on('error', (error) => {
      closed = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      closed = true
      closeSignal = signal
      clearTimeout(timer)
      if (timedOut) {
        resolve(124)
        return
      }
      if (code !== null) {
        resolve(code)
        return
      }
      resolve(exitCodeFromSignal(signal))
    })
  })

  const output = Buffer.concat(captured).toString('utf8')
  const capturedBytes = Buffer.byteLength(output, 'utf8')
  const truncated = totalOutputBytes > capturedBytes
  const summary = `${summarizeOutput(output, timedOut)}${truncated ? '\n[output truncated before indexing]' : ''}`
  const indexed = output.trim().length > 0
  const store = new SessionMemoryStore(dbPath)
  try {
    store.purge({ source: label, confirm: true })
    if (indexed) {
      store.indexChunk({
        id: `command:${commandChunkId(label, command, output)}`,
        source: label,
        text: output,
        metadata: {
          command,
          cwd,
          exitCode,
          outputBytes: totalOutputBytes,
          capturedBytes,
          maxCaptureBytes: MAX_CAPTURE_BYTES,
          truncated,
          timedOut,
          ...(closeSignal ? { signal: closeSignal } : {}),
          kind: 'session_command_output',
          executionBackend: 'typescript',
          fallbackReason,
        },
      })
    }
  } finally {
    store.close()
  }
  return {
    label,
    exitCode,
    outputBytes: totalOutputBytes,
    indexed,
    summary,
    backend: 'typescript',
    fallbackReason,
    truncated,
    capturedBytes,
    maxCaptureBytes: MAX_CAPTURE_BYTES,
    timedOut,
    ...(closeSignal ? { signal: closeSignal } : {}),
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
  try {
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
      backend: 'native',
      truncated: result.truncated,
      capturedBytes: result.capturedBytes,
      maxCaptureBytes: result.maxCaptureBytes,
      timedOut: result.timedOut,
    }
  } catch (error) {
    if (!(error instanceof NativeSessionMemoryUnavailableError)) {
      throw error
    }
    return runTypeScriptSessionCommand({
      command,
      label,
      cwd,
      projectRoot,
      timeoutMs,
      dbPath,
      fallbackReason: error.message,
    })
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
