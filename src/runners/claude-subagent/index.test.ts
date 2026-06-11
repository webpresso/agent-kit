import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '#runners/types.js'
import { ClaudeSubagentRunner } from '#runners/claude-subagent/index.js'
import type { SubagentFn } from './types.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VERSION = '0.15.1'

const TASK: RunnerTask = {
  id: 'task-1',
  description: 'Run the hello blueprint',
  permissions: 'workspace-write',
}

const CTX: RunnerContext = {
  cwd: '/tmp/test-workspace',
}

function makeRunner(subagentFn: SubagentFn): ClaudeSubagentRunner {
  return new ClaudeSubagentRunner(VERSION, subagentFn)
}

async function collectEvents(
  execution: ReturnType<ClaudeSubagentRunner['prepare']>,
  signal?: AbortSignal,
) {
  const events = []
  for await (const event of execution.run(signal)) {
    events.push(event)
  }
  return events
}

// ---------------------------------------------------------------------------
// Runner identity
// ---------------------------------------------------------------------------

describe('ClaudeSubagentRunner', () => {
  it('has id claude-subagent', () => {
    const runner = makeRunner(vi.fn())
    expect(runner.id).toStrictEqual('claude-subagent')
  })

  it('exposes the version passed to constructor', () => {
    const runner = makeRunner(vi.fn())
    expect(runner.version).toStrictEqual(VERSION)
  })

  it('exposes read and workspace-write capabilities', () => {
    const runner = makeRunner(vi.fn())
    expect(runner.capabilities).toStrictEqual(['read', 'workspace-write'])
  })
})

// ---------------------------------------------------------------------------
// prepare() — handle uniqueness
// ---------------------------------------------------------------------------

describe('prepare()', () => {
  it('returns a RunnerExecution with a non-empty handle (UUID)', () => {
    const runner = makeRunner(vi.fn())
    const exec = runner.prepare(TASK, CTX)
    expect(exec.handle).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('two prepare() calls produce different handles', () => {
    const runner = makeRunner(vi.fn())
    const exec1 = runner.prepare(TASK, CTX)
    const exec2 = runner.prepare(TASK, CTX)
    expect(exec1.handle).not.toStrictEqual(exec2.handle)
  })
})

// ---------------------------------------------------------------------------
// run() — success path
// ---------------------------------------------------------------------------

describe('run() with successful subagentFn', () => {
  it('yields started → stdout → completed', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue('hello world')
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    const events = await collectEvents(exec)

    expect(events[0]?.type).toStrictEqual('started')
    expect(events[0]?.handle).toStrictEqual(exec.handle)

    const stdout = events.filter((e) => e.type === 'stdout')
    expect(stdout.length).toBeGreaterThanOrEqual(1)

    const last = events.at(-1)
    expect(last?.type).toStrictEqual('completed')
    expect(last).toStrictEqual(
      expect.objectContaining({ type: 'completed', handle: exec.handle, exitCode: 0 }),
    )
  })

  it('calls subagentFn with task description and ctx options', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue('ok')
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    await collectEvents(exec)

    expect(subagentFn).toHaveBeenCalledWith(TASK.description, {
      cwd: CTX.cwd,
      env: CTX.env,
      signal: undefined,
    })
  })

  it('snapshot status is completed after run finishes', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue('result')
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    await collectEvents(exec)

    expect(exec.snapshot().status).toStrictEqual('completed')
  })

  it('snapshot events include started and completed', async () => {
    const subagentFn: SubagentFn = vi.fn().mockResolvedValue('line1\nline2')
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    await collectEvents(exec)

    const snap = exec.snapshot()
    expect(snap.events[0]?.type).toStrictEqual('started')
    expect(snap.events.at(-1)?.type).toStrictEqual('completed')
  })
})

// ---------------------------------------------------------------------------
// run() — failure path
// ---------------------------------------------------------------------------

describe('run() with failing subagentFn', () => {
  it('yields started → failed', async () => {
    const subagentFn: SubagentFn = vi.fn().mockRejectedValue(new Error('agent crashed'))
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    const events = await collectEvents(exec)

    expect(events[0]?.type).toStrictEqual('started')
    const last = events.at(-1)
    expect(last).toStrictEqual(
      expect.objectContaining({ type: 'failed', handle: exec.handle, error: 'agent crashed' }),
    )
  })

  it('snapshot status is failed after error', async () => {
    const subagentFn: SubagentFn = vi.fn().mockRejectedValue(new Error('boom'))
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)
    await collectEvents(exec)

    expect(exec.snapshot().status).toStrictEqual('failed')
  })
})

// ---------------------------------------------------------------------------
// run() — abort/cancel path
// ---------------------------------------------------------------------------

describe('run() with already-aborted AbortSignal', () => {
  it('yields only cancelled when signal is already aborted', async () => {
    const subagentFn: SubagentFn = vi.fn()
    const exec = makeRunner(subagentFn).prepare(TASK, CTX)

    const controller = new AbortController()
    controller.abort()

    const events = await collectEvents(exec, controller.signal)

    expect(events).toStrictEqual([
      expect.objectContaining({ type: 'cancelled', handle: exec.handle }),
    ])
    expect(subagentFn).not.toHaveBeenCalled()
  })

  it('snapshot status is cancelled after abort', async () => {
    const exec = makeRunner(vi.fn()).prepare(TASK, CTX)
    const controller = new AbortController()
    controller.abort()

    await collectEvents(exec, controller.signal)
    expect(exec.snapshot().status).toStrictEqual('cancelled')
  })
})

// ---------------------------------------------------------------------------
// teardown() — idempotency
// ---------------------------------------------------------------------------

describe('teardown()', () => {
  it('resolves without error', async () => {
    const exec = makeRunner(vi.fn()).prepare(TASK, CTX)
    await expect(exec.teardown()).resolves.toStrictEqual(undefined)
  })

  it('is idempotent — calling twice does not throw', async () => {
    const exec = makeRunner(vi.fn()).prepare(TASK, CTX)
    await exec.teardown()
    await expect(exec.teardown()).resolves.toStrictEqual(undefined)
  })
})
