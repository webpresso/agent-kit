import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import wpTestTool from './test.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(
  opts: {
    stdout?: string
    stderr?: string
    exitCode?: number
    hang?: boolean
    killCapture?: { signal: NodeJS.Signals | null }
  } = {},
): unknown {
  let closeFn: ((code: number | null, signal?: NodeJS.Signals | null) => void) | null = null
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stdout) fn(Buffer.from(opts.stdout))
      },
    },
    stderr: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stderr) fn(Buffer.from(opts.stderr))
      },
    },
    on: (event: string, fn: (code: number | null, signal?: NodeJS.Signals | null) => void) => {
      if (event === 'close') {
        closeFn = fn
        if (!opts.hang) queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
    kill: (signal: NodeJS.Signals) => {
      if (opts.killCapture) opts.killCapture.signal = signal
      if (closeFn) queueMicrotask(() => closeFn?.(null, signal))
    },
  }
}

function writeVitestWorkspace(root: string): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^4.0.0' },
    }),
  )
}

function writeTestFiles(root: string, count: number): void {
  mkdirSync(join(root, 'src'), { recursive: true })
  for (let index = 1; index <= count; index += 1) {
    writeFileSync(
      join(root, `src/spec-${index}.test.ts`),
      `import { it, expect } from 'vitest'\nit('spec-${index}', () => expect(1).toBe(1))\n`,
    )
  }
}

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR

afterEach(() => {
  spawnMock.mockReset()
  if (originalProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR
  } else {
    process.env.CLAUDE_PROJECT_DIR = originalProjectDir
  }
})

describe('wp_test tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(wpTestTool.name).toBe('wp_test')
    expect(typeof wpTestTool.description).toBe('string')
    expect(wpTestTool.handler).toBeTypeOf('function')
  })

  describe('vp runner', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), `wp-mcp-test-tool-${randomUUID().slice(0, 8)}-`))
      process.env.CLAUDE_PROJECT_DIR = dir
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('routes package tests through `vp`', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      const result = await wpTestTool.handler({ packages: ['x'] })
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('vp')
      expect(args).toEqual(['run', '--filter', 'x', 'test'])
      // Result is wrapped in MCP content blocks with a terse text summary and
      // the full machine-readable payload in structuredContent.
      expect(result.content[0]).toMatchObject({ type: 'text' })
      const payload = result.structuredContent as Record<string, unknown>
      expect(payload).toMatchObject({
        passed: true,
        summary: 'tests passed for 1 package',
        exitCode: 0,
      })
      expect((result.content[0] as { text: string }).text).toBe('tests passed for 1 package')
    })

    it('preserves file filters when package targets are provided on the vp path', async () => {
      mkdirSync(join(dir, 'packages', 'x'), { recursive: true })
      writeFileSync(
        join(dir, 'packages', 'x', 'package.json'),
        JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      )
      spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      await wpTestTool.handler({ packages: ['x'], files: ['src/example.test.ts'] })
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('vp')
      expect(args).toEqual([
        'exec',
        '--filter',
        'x',
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
        'src/example.test.ts',
      ])
    })

    it('rejects `suite` as an unknown input key', async () => {
      await expect(wpTestTool.handler({ suite: 'e2e', packages: ['x'] })).rejects.toSatisfy(
        (error: unknown) => {
          return (
            error instanceof Error &&
            /suite/i.test(error.message) &&
            /unrecognized key/i.test(error.message)
          )
        },
      )
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('rejects invalid workspace sharding inputs', async () => {
      await expect(
        wpTestTool.handler({ workspaceSharding: { maxShards: 1 }, packages: ['x'] }),
      ).rejects.toSatisfy((error: unknown) => {
        return error instanceof Error && /maxShards/i.test(error.message)
      })
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('rejects tool budgets above the MCP-safe maximum before spawning', async () => {
      await expect(wpTestTool.handler({ timeoutMs: 110_001, packages: ['x'] })).rejects.toSatisfy(
        (error: unknown) => error instanceof Error && /timeoutMs/i.test(error.message),
      )
      await expect(
        wpTestTool.handler({
          timeoutMs: 110_000,
          workspaceSharding: { totalBudgetMs: 110_001 },
          packages: ['x'],
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error &&
          /workspaceSharding/i.test(error.message) &&
          /totalBudgetMs/i.test(error.message),
      )
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('rejects totalBudgetMs greater than timeoutMs before spawning', async () => {
      await expect(
        wpTestTool.handler({
          timeoutMs: 5_000,
          workspaceSharding: { totalBudgetMs: 6_000 },
          packages: ['x'],
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof Error &&
          /totalBudgetMs/i.test(error.message) &&
          /timeoutMs/i.test(error.message),
      )
      expect(spawnMock).not.toHaveBeenCalled()
    })

    // Regression: a non-zero exit whose output parsed zero test failures is a
    // runner crash, not test failures. Non-structured failing output (no
    // FAIL/Error tokens) used to clip at the 4000 generic cap, blowing the QA
    // evidence budget. Now bounded to the runner-failure budget + logged.
    it('bounds a runner failure (non-zero exit, no parseable failures) under the QA budget', async () => {
      const blob = 'runner bootstrap frame padding padding padding padding\n'.repeat(20)
      spawnMock.mockReturnValue(fakeChild({ stdout: blob, exitCode: 1 }))

      const result = await wpTestTool.handler({ packages: ['x'] })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        rawOutput?: string
        truncated?: boolean
        logPath?: string
        bytes?: number
      }
      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/tests failed for 1 package/)
      expect(payload.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(800)
      expect(Buffer.byteLength(payload.rawOutput ?? '')).toBeLessThanOrEqual(600)
      expect(payload.truncated).toBe(true)
      expect(payload.logPath).toMatch(/^logs\//)
    })

    it('keeps the 4000 generic clip for long output that is not a bare failure', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 0 }))

      const result = await wpTestTool.handler({ packages: ['x'] })
      const payload = result.structuredContent as { rawOutput?: string; truncated?: boolean }
      expect(payload.rawOutput).toHaveLength(4_000)
      expect(payload.truncated).toBe(true)
    })

    it('threads MCP cancellation into the underlying test process', async () => {
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))
      const controller = new AbortController()

      const promise = wpTestTool.handler({ packages: ['x'] }, { signal: controller.signal })
      controller.abort()
      const result = await promise
      const payload = result.structuredContent as {
        aborted?: boolean
        failures?: Array<{ message: string }>
      }

      expect(killCapture.signal).toBe('SIGTERM')
      expect(payload.aborted).toBe(true)
      expect(payload.failures?.[0]?.message).toMatch(/aborted/)
    })

    it('marks timed out test execution as isError: true with a timeout summary', async () => {
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))

      const result = await wpTestTool.handler({ packages: ['x'], timeoutMs: 1 })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        timedOut?: boolean
        failures?: Array<{ message: string }>
      }

      expect(killCapture.signal).toBe('SIGTERM')
      expect(result.isError).toBe(true)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('tests timed out for 1 package (package x)')
      expect(payload.timedOut).toBe(true)
      expect(payload.failures?.[0]?.message).toMatch(/timed out/i)
    })

    it('surfaces timed out shard scope for root vitest workspace runs', async () => {
      writeVitestWorkspace(dir)
      writeTestFiles(dir, 6)
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock
        .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
        .mockReturnValueOnce(fakeChild({ stdout: 'should-not-run\n', exitCode: 0 }))

      const result = await wpTestTool.handler({ timeoutMs: 1 })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        details?: { failureScope?: string }
        timedOut?: boolean
      }

      expect(killCapture.signal).toBe('SIGTERM')
      expect(payload.passed).toBe(false)
      expect(payload.timedOut).toBe(true)
      expect(payload.summary).toMatch(/tests timed out for workspace/)
      expect(payload.summary).toMatch(/shard 1\/2/)
      expect(payload.details?.failureScope).toMatch(/shard 1\/2/)
    })

    it('allows disabling workspace sharding via tool input', async () => {
      writeVitestWorkspace(dir)
      writeTestFiles(dir, 6)
      spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

      const result = await wpTestTool.handler({ workspaceSharding: { enabled: false } })
      const payload = result.structuredContent as {
        passed: boolean
        details?: { workspaceSharding?: { enabled?: boolean } }
      }
      const [cmd, args] = spawnMock.mock.calls[0]!

      expect(cmd).toBe('vp')
      expect(args).toEqual(['run', 'test'])
      expect(payload.passed).toBe(true)
      expect(payload.details?.workspaceSharding?.enabled).toBe(false)
    })

    it('shards explicit vitest file filters when workspace sharding is enabled', async () => {
      writeVitestWorkspace(dir)
      writeTestFiles(dir, 6)
      const files = Array.from({ length: 6 }, (_, index) => `src/spec-${index + 1}.test.ts`)
      spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      const result = await wpTestTool.handler({ files })
      const payload = result.structuredContent as {
        passed: boolean
        details?: { workspaceSharding?: { enabled?: boolean } }
      }

      expect(spawnMock).toHaveBeenCalledTimes(2)
      const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[])
      for (const args of shardCalls) {
        expect(args.slice(0, 6)).toEqual([
          'exec',
          '--',
          'vitest',
          'run',
          '--reporter=json',
          '--no-color',
        ])
      }
      expect(payload.passed).toBe(true)
      expect(payload.details?.workspaceSharding?.enabled).not.toBe(false)
    })

    it('surfaces global test budget exhaustion with a meaningful scope', async () => {
      writeVitestWorkspace(dir)
      writeTestFiles(dir, 6)
      const nowSpy = vi.spyOn(Date, 'now')
      nowSpy.mockReturnValueOnce(1_000_000)
      nowSpy.mockReturnValueOnce(1_090_001)
      try {
        const result = await wpTestTool.handler({})
        const payload = result.structuredContent as {
          passed: boolean
          summary: string
          timedOut?: boolean
          details?: { failureScope?: string }
        }

        expect(spawnMock).not.toHaveBeenCalled()
        expect(payload.passed).toBe(false)
        expect(payload.timedOut).toBe(true)
        expect(payload.summary).toMatch(/overall test budget/)
        expect(payload.details?.failureScope).toBe('overall test budget')
      } finally {
        nowSpy.mockRestore()
      }
    })

    it('surfaces workspace-command scope when bare workspace run times out', async () => {
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))

      const result = await wpTestTool.handler({ timeoutMs: 1 })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        timedOut?: boolean
        details?: { failureScope?: string }
      }

      expect(killCapture.signal).toBe('SIGTERM')
      expect(payload.passed).toBe(false)
      expect(payload.timedOut).toBe(true)
      expect(payload.summary).toContain('workspace command')
      expect(payload.details?.failureScope).toBe('workspace command')
    })
  })
})
