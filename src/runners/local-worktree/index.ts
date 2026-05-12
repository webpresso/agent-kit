import type { SpawnSyncReturns } from 'node:child_process'
import { spawnSync as nodeSpawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import type {
  Runner,
  RunnerContext,
  RunnerEvent,
  RunnerExecution,
  RunnerSnapshot,
  RunnerTask,
} from '#runners/types'
import { generateWorktreePath } from './path.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpawnSyncFn = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string },
) => SpawnSyncReturns<Buffer>

interface LocalWorktreeRunnerOptions {
  /** Injected for testing; defaults to Node's spawnSync. */
  readonly spawnSync?: SpawnSyncFn
}

// ---------------------------------------------------------------------------
// LocalWorktreeExecution
// ---------------------------------------------------------------------------

class LocalWorktreeExecution implements RunnerExecution {
  readonly handle: string

  private readonly worktreePath: string
  private readonly spawnSync: SpawnSyncFn
  private readonly cwd: string
  private readonly events: RunnerEvent[] = []
  private worktreeCreated = false
  private tornDown = false

  constructor(handle: string, worktreePath: string, cwd: string, spawnFn: SpawnSyncFn) {
    this.handle = handle
    this.worktreePath = worktreePath
    this.cwd = cwd
    this.spawnSync = spawnFn
  }

  async *run(_signal?: AbortSignal): AsyncIterable<RunnerEvent> {
    const ts = new Date().toISOString()

    const started: RunnerEvent = { type: 'started', ts, handle: this.handle }
    this.events.push(started)
    yield started

    const result = this.spawnSync('git', ['worktree', 'add', this.worktreePath], { cwd: this.cwd })

    if (result.status !== 0) {
      const stderr =
        result.stderr instanceof Buffer ? result.stderr.toString() : String(result.stderr)
      const failed: RunnerEvent = {
        type: 'failed',
        ts: new Date().toISOString(),
        handle: this.handle,
        error: stderr || 'git worktree add failed',
      }
      this.events.push(failed)
      yield failed
      return
    }

    this.worktreeCreated = true

    const completed: RunnerEvent = {
      type: 'completed',
      ts: new Date().toISOString(),
      handle: this.handle,
      exitCode: 0,
    }
    this.events.push(completed)
    yield completed
  }

  snapshot(): RunnerSnapshot {
    const last = this.events[this.events.length - 1]
    const status =
      last?.type === 'completed'
        ? 'completed'
        : last?.type === 'failed'
          ? 'failed'
          : last?.type === 'cancelled'
            ? 'cancelled'
            : 'running'

    return { handle: this.handle, status, events: [...this.events] }
  }

  async teardown(): Promise<void> {
    if (this.tornDown || !this.worktreeCreated) {
      return
    }
    this.tornDown = true
    this.spawnSync('git', ['worktree', 'remove', '--force', this.worktreePath], { cwd: this.cwd })
  }
}

// ---------------------------------------------------------------------------
// LocalWorktreeRunner
// ---------------------------------------------------------------------------

export class LocalWorktreeRunner implements Runner {
  readonly id = 'local-worktree'
  readonly version = '0.1.0'
  readonly capabilities: readonly string[] = ['worktree']

  private readonly spawnSync: SpawnSyncFn

  constructor(opts: LocalWorktreeRunnerOptions = {}) {
    this.spawnSync = opts.spawnSync ?? (nodeSpawnSync as SpawnSyncFn)
  }

  prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution {
    const handle = randomUUID()
    const worktreePath = generateWorktreePath(ctx.cwd, task.id)
    return new LocalWorktreeExecution(handle, worktreePath, ctx.cwd, this.spawnSync)
  }
}
