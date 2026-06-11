import { describe, expect, it, vi } from 'vitest'

import { CodexExecRunner } from '#runners/codex-exec/index.js'

import type { SpawnSyncReturns } from 'node:child_process'
import type { RunnerContext, RunnerEvent, RunnerTask } from '#runners/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTask = (overrides: Partial<RunnerTask> = {}): RunnerTask => ({
  id: 'task-1',
  description: 'list files',
  permissions: 'read',
  ...overrides,
})

const makeCtx = (overrides: Partial<RunnerContext> = {}): RunnerContext => ({
  cwd: '/tmp/test',
  ...overrides,
})

const makeSpawnResult = (
  stdout: string,
  stderr: string,
  status: number,
): SpawnSyncReturns<Buffer> => ({
  pid: 1234,
  output: [],
  stdout: Buffer.from(stdout),
  stderr: Buffer.from(stderr),
  status,
  signal: null,
  error: undefined,
})

async function collect(iterable: AsyncIterable<RunnerEvent>): Promise<RunnerEvent[]> {
  const events: RunnerEvent[] = []
  for await (const event of iterable) {
    events.push(event)
  }
  return events
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexExecRunner', () => {
  describe('prepare()', () => {
    it('returns a RunnerExecution for read-only tasks', () => {
      const runner = new CodexExecRunner()
      const execution = runner.prepare(makeTask({ permissions: 'read' }), makeCtx())

      expect(typeof execution.handle).toStrictEqual('string')
      expect(execution.handle.length).toBeGreaterThan(0)
      expect(execution.run).toBeInstanceOf(Function)
      expect(execution.snapshot).toBeInstanceOf(Function)
      expect(execution.teardown).toBeInstanceOf(Function)
    })

    it('throws for workspace-write tasks with tech-debt mention', () => {
      const runner = new CodexExecRunner()

      expect(() => runner.prepare(makeTask({ permissions: 'workspace-write' }), makeCtx())).toThrow(
        'codex-exec backend only supports read-only tasks in v1.0 alpha. See tech-debt item h-002 for workspace-write support.',
      )
    })
  })

  describe('run()', () => {
    it('yields started → stdout lines → completed on exit code 0', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('line one\nline two\n', '', 0))

      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const execution = runner.prepare(makeTask(), makeCtx())
      const events = await collect(execution.run())

      expect(events[0]).toMatchObject({ type: 'started', handle: execution.handle })
      expect(events[1]).toMatchObject({
        type: 'stdout',
        line: 'line one',
        handle: execution.handle,
      })
      expect(events[2]).toMatchObject({
        type: 'stdout',
        line: 'line two',
        handle: execution.handle,
      })
      expect(events[3]).toMatchObject({ type: 'completed', exitCode: 0, handle: execution.handle })
      expect(events).toHaveLength(4)
    })

    it('yields started → stderr lines → failed on exit code 1', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('', 'something went wrong\n', 1))

      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const execution = runner.prepare(makeTask(), makeCtx())
      const events = await collect(execution.run())

      expect(events[0]).toMatchObject({ type: 'started' })
      const lastEvent = events[events.length - 1]
      expect(lastEvent).toMatchObject({ type: 'failed', handle: execution.handle })
      expect(lastEvent.type).toStrictEqual('failed')
    })

    it('passes correct arguments to spawnSync', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('ok', '', 0))

      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const ctx = makeCtx({ cwd: '/some/dir' })
      const task = makeTask({ description: 'run the tests' })
      const execution = runner.prepare(task, ctx)
      await collect(execution.run())

      expect(mockSpawn).toHaveBeenCalledWith(
        'codex',
        ['exec', 'run the tests', '-s', 'read-only', '-C', '/some/dir'],
        expect.objectContaining({ encoding: 'buffer' }),
      )
    })

    it('yields cancelled immediately when AbortSignal is already aborted', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('', '', 0))

      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const execution = runner.prepare(makeTask(), makeCtx())

      const controller = new AbortController()
      controller.abort()

      const events = await collect(execution.run(controller.signal))

      expect(events[0]).toMatchObject({ type: 'started' })
      expect(events[1]).toMatchObject({ type: 'cancelled', handle: execution.handle })
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })

  describe('snapshot()', () => {
    it('returns running status before run', () => {
      const runner = new CodexExecRunner()
      const execution = runner.prepare(makeTask(), makeCtx())
      const snap = execution.snapshot()

      expect(snap.handle).toStrictEqual(execution.handle)
      expect(snap.status).toStrictEqual('running')
      expect(snap.events).toStrictEqual([])
    })

    it('returns completed status after successful run', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('done', '', 0))
      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const execution = runner.prepare(makeTask(), makeCtx())
      await collect(execution.run())

      expect(execution.snapshot().status).toStrictEqual('completed')
    })

    it('returns failed status after non-zero exit', async () => {
      const mockSpawn = vi.fn().mockReturnValue(makeSpawnResult('', 'err', 1))
      const runner = new CodexExecRunner({ spawn: mockSpawn })
      const execution = runner.prepare(makeTask(), makeCtx())
      await collect(execution.run())

      expect(execution.snapshot().status).toStrictEqual('failed')
    })
  })

  describe('teardown()', () => {
    it('is idempotent — calling multiple times does not throw', async () => {
      const runner = new CodexExecRunner()
      const execution = runner.prepare(makeTask(), makeCtx())

      await expect(execution.teardown()).resolves.toStrictEqual(undefined)
      await expect(execution.teardown()).resolves.toStrictEqual(undefined)
      await expect(execution.teardown()).resolves.toStrictEqual(undefined)
    })
  })
})
