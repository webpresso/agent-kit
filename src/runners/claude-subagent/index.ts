import type {
  Runner,
  RunnerContext,
  RunnerEvent,
  RunnerExecution,
  RunnerSnapshot,
  RunnerTask,
} from '#runners/types'
import type { SubagentFn } from './types.js'

// ---------------------------------------------------------------------------
// Stub default subagent — replaced in Wave 4 (Task 4.1)
// ---------------------------------------------------------------------------

const notImplemented: SubagentFn = (_prompt, _opts) => {
  return Promise.reject(new Error('not implemented — inject subagentFn'))
}

// ---------------------------------------------------------------------------
// ClaudeSubagentExecution — live execution handle
// ---------------------------------------------------------------------------

class ClaudeSubagentExecution implements RunnerExecution {
  readonly handle: string

  private readonly task: RunnerTask
  private readonly ctx: RunnerContext
  private readonly subagentFn: SubagentFn
  private readonly collectedEvents: RunnerEvent[] = []
  private status: 'running' | 'completed' | 'failed' | 'cancelled' = 'running'

  constructor(handle: string, task: RunnerTask, ctx: RunnerContext, subagentFn: SubagentFn) {
    this.handle = handle
    this.task = task
    this.ctx = ctx
    this.subagentFn = subagentFn
  }

  async *run(signal?: AbortSignal): AsyncIterable<RunnerEvent> {
    if (signal?.aborted === true) {
      const event: RunnerEvent = {
        type: 'cancelled',
        ts: new Date().toISOString(),
        handle: this.handle,
      }
      this.collectedEvents.push(event)
      this.status = 'cancelled'
      yield event
      return
    }

    const startedEvent: RunnerEvent = {
      type: 'started',
      ts: new Date().toISOString(),
      handle: this.handle,
    }
    this.collectedEvents.push(startedEvent)
    yield startedEvent

    try {
      const output = await this.subagentFn(this.task.description, {
        cwd: this.ctx.cwd,
        env: this.ctx.env,
        signal,
      })

      for (const line of output.split('\n')) {
        if (line.length === 0) {
          continue
        }
        const stdoutEvent: RunnerEvent = {
          type: 'stdout',
          ts: new Date().toISOString(),
          handle: this.handle,
          line,
        }
        this.collectedEvents.push(stdoutEvent)
        yield stdoutEvent
      }

      const completedEvent: RunnerEvent = {
        type: 'completed',
        ts: new Date().toISOString(),
        handle: this.handle,
        exitCode: 0,
      }
      this.collectedEvents.push(completedEvent)
      this.status = 'completed'
      yield completedEvent
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const failedEvent: RunnerEvent = {
        type: 'failed',
        ts: new Date().toISOString(),
        handle: this.handle,
        error: message,
      }
      this.collectedEvents.push(failedEvent)
      this.status = 'failed'
      yield failedEvent
    }
  }

  snapshot(): RunnerSnapshot {
    return {
      handle: this.handle,
      status: this.status,
      events: [...this.collectedEvents],
    }
  }

  async teardown(): Promise<void> {
    // Idempotent — nothing to clean up for the subagent-based runner.
    // Called once or multiple times; both are safe.
  }
}

// ---------------------------------------------------------------------------
// ClaudeSubagentRunner — factory
// ---------------------------------------------------------------------------

export class ClaudeSubagentRunner implements Runner {
  readonly id = 'claude-subagent'
  readonly version: string
  readonly capabilities: readonly string[]

  private readonly subagentFn: SubagentFn

  constructor(version: string, subagentFn: SubagentFn = notImplemented) {
    this.version = version
    this.capabilities = ['read', 'workspace-write']
    this.subagentFn = subagentFn
  }

  prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution {
    const handle = crypto.randomUUID()
    return new ClaudeSubagentExecution(handle, task, ctx, this.subagentFn)
  }
}
