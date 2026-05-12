import { spawnSync } from 'node:child_process'

import type { SpawnSyncOptionsWithBufferEncoding, SpawnSyncReturns } from 'node:child_process'
import type {
  Runner,
  RunnerContext,
  RunnerEvent,
  RunnerExecution,
  RunnerSnapshot,
  RunnerTask,
} from '#runners/types'

// ---------------------------------------------------------------------------
// DI seam
// ---------------------------------------------------------------------------

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithBufferEncoding,
) => SpawnSyncReturns<Buffer>

export interface CodexExecRunnerOptions {
  readonly spawn?: SpawnFn
}

// ---------------------------------------------------------------------------
// Internal execution state
// ---------------------------------------------------------------------------

type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled'

// ---------------------------------------------------------------------------
// CodexExecExecution
// ---------------------------------------------------------------------------

class CodexExecExecution implements RunnerExecution {
  readonly handle: string

  private readonly _task: RunnerTask
  private readonly _ctx: RunnerContext
  private readonly _spawn: SpawnFn
  private _status: ExecutionStatus = 'running'
  private readonly _events: RunnerEvent[] = []

  constructor(handle: string, task: RunnerTask, ctx: RunnerContext, spawnFn: SpawnFn) {
    this.handle = handle
    this._task = task
    this._ctx = ctx
    this._spawn = spawnFn
  }

  async *run(signal?: AbortSignal): AsyncIterable<RunnerEvent> {
    const ts = () => new Date().toISOString()

    const startedEvent: RunnerEvent = { type: 'started', ts: ts(), handle: this.handle }
    this._events.push(startedEvent)
    yield startedEvent

    if (signal?.aborted === true) {
      const cancelledEvent: RunnerEvent = { type: 'cancelled', ts: ts(), handle: this.handle }
      this._events.push(cancelledEvent)
      this._status = 'cancelled'
      yield cancelledEvent
      return
    }

    const result = this._spawn('codex', ['exec', this._task.description, '-s', 'read-only', '-C', this._ctx.cwd], {
      encoding: 'buffer',
    })

    const stdoutStr = result.stdout.toString('utf8')
    for (const line of splitLines(stdoutStr)) {
      const evt: RunnerEvent = { type: 'stdout', ts: ts(), handle: this.handle, line }
      this._events.push(evt)
      yield evt
    }

    const stderrStr = result.stderr.toString('utf8')
    for (const line of splitLines(stderrStr)) {
      const evt: RunnerEvent = { type: 'stderr', ts: ts(), handle: this.handle, line }
      this._events.push(evt)
      yield evt
    }

    if (result.status === 0) {
      const completedEvent: RunnerEvent = {
        type: 'completed',
        ts: ts(),
        handle: this.handle,
        exitCode: 0,
      }
      this._events.push(completedEvent)
      this._status = 'completed'
      yield completedEvent
    } else {
      const exitCode = result.status ?? 1
      const failedEvent: RunnerEvent = {
        type: 'failed',
        ts: ts(),
        handle: this.handle,
        error: `codex exited with code ${exitCode}`,
      }
      this._events.push(failedEvent)
      this._status = 'failed'
      yield failedEvent
    }
  }

  snapshot(): RunnerSnapshot {
    return {
      handle: this.handle,
      status: this._status,
      events: [...this._events],
    }
  }

  async teardown(): Promise<void> {
    // Idempotent no-op in v1.0 (spawnSync is synchronous; no process to kill)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
}

// ---------------------------------------------------------------------------
// CodexExecRunner
// ---------------------------------------------------------------------------

export class CodexExecRunner implements Runner {
  readonly id = 'codex-exec'
  readonly version = '1.0.0'
  readonly capabilities: readonly string[] = ['read-only']

  private readonly _spawn: SpawnFn

  constructor(options: CodexExecRunnerOptions = {}) {
    this._spawn = options.spawn ?? (spawnSync as SpawnFn)
  }

  prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution {
    if (task.permissions === 'workspace-write') {
      throw new Error(
        'codex-exec backend only supports read-only tasks in v1.0 alpha. See tech-debt item h-002 for workspace-write support.',
      )
    }

    const handle = crypto.randomUUID()
    return new CodexExecExecution(handle, task, ctx, this._spawn)
  }
}
