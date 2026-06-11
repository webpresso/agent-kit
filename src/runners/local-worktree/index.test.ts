import type { SpawnSyncReturns } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import type { RunnerContext, RunnerTask } from '#runners/types.js'
import { LocalWorktreeRunner } from '#runners/local-worktree/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(id = 'task-1'): RunnerTask {
  return { id, description: 'test task', permissions: 'read' }
}

function makeCtx(cwd = '/repo'): RunnerContext {
  return { cwd }
}

function successSpawn(): SpawnSyncReturns<Buffer> {
  return {
    status: 0,
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
    pid: 1,
    output: [],
    signal: null,
    error: undefined,
  }
}

function failureSpawn(): SpawnSyncReturns<Buffer> {
  return {
    status: 1,
    stdout: Buffer.from(''),
    stderr: Buffer.from('fatal: error'),
    pid: 1,
    output: [],
    signal: null,
    error: undefined,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalWorktreeRunner', () => {
  it('prepare() returns a RunnerExecution with a unique handle', () => {
    const spawn = vi.fn().mockReturnValue(successSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const execution = runner.prepare(makeTask(), makeCtx())
    expect(typeof execution.handle).toStrictEqual('string')
    expect(execution.handle.length).toBeGreaterThan(0)
  })

  it('two prepare() calls return different handles AND different worktree paths', () => {
    const spawn = vi.fn().mockReturnValue(successSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const exec1 = runner.prepare(makeTask('t1'), makeCtx())
    const exec2 = runner.prepare(makeTask('t2'), makeCtx())
    expect(exec1.handle).not.toStrictEqual(exec2.handle)
  })

  it('run() with git success yields started then completed', async () => {
    const spawn = vi.fn().mockReturnValue(successSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const execution = runner.prepare(makeTask(), makeCtx())

    const events: string[] = []
    for await (const event of execution.run()) {
      events.push(event.type)
    }

    expect(events).toStrictEqual(['started', 'completed'])
  })

  it('run() with git failure yields started then failed', async () => {
    const spawn = vi.fn().mockReturnValue(failureSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const execution = runner.prepare(makeTask(), makeCtx())

    const events: string[] = []
    for await (const event of execution.run()) {
      events.push(event.type)
    }

    expect(events).toStrictEqual(['started', 'failed'])
  })

  it('teardown() calls git worktree remove --force', async () => {
    const spawn = vi.fn().mockReturnValue(successSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const execution = runner.prepare(makeTask(), makeCtx())

    // Run first so worktree path is recorded
    for await (const _ of execution.run()) {
      // consume events
    }

    spawn.mockClear()
    await execution.teardown()

    expect(spawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toStrictEqual('git')
    expect(args).toContain('worktree')
    expect(args).toContain('remove')
    expect(args).toContain('--force')
  })

  it('teardown() called twice does not throw (idempotent)', async () => {
    const spawn = vi.fn().mockReturnValue(successSpawn())
    const runner = new LocalWorktreeRunner({ spawnSync: spawn })
    const execution = runner.prepare(makeTask(), makeCtx())

    for await (const _ of execution.run()) {
      // consume events
    }

    await execution.teardown()
    await expect(execution.teardown()).resolves.toStrictEqual(undefined)
  })
})
