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

    it('accepts suite selection and includes it in structured output details', async () => {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'workspace-root' }))
      mkdirSync(join(dir, 'packages', 'x'), { recursive: true })
      writeFileSync(
        join(dir, 'packages', 'x', 'package.json'),
        JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      )
      spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      const result = await wpTestTool.handler({ suite: 'unit', packages: ['x'] })
      const payload = result.structuredContent as {
        passed: boolean
        details?: { suite?: string }
      }

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        'exec',
        '--filter',
        'x',
        '--',
        'vitest',
        'run',
        '--exclude',
        '**/*.integration.test.ts',
        '--exclude',
        '**/*.e2e.test.ts',
        '--reporter=json',
        '--no-color',
      ])
      expect(payload.passed).toBe(true)
      expect(payload.details?.suite).toBe('unit')
    })

    it('rejects invalid suite values before spawning', async () => {
      await expect(wpTestTool.handler({ suite: 'e2e', packages: ['x'] })).rejects.toSatisfy(
        (error: unknown) => error instanceof Error && /suite/i.test(error.message),
      )
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('treats suite selection as a filter over explicit file targets', async () => {
      writeVitestWorkspace(dir)
      spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      const result = await wpTestTool.handler({
        suite: 'unit',
        files: ['src/example.test.ts', 'src/slow.integration.test.ts'],
      })
      const payload = result.structuredContent as {
        passed: boolean
        details?: { suite?: string; files?: string[] }
      }

      expect(spawnMock).toHaveBeenCalledOnce()
      expect(spawnMock.mock.calls[0]![1]).toEqual([
        'exec',
        '--',
        'vitest',
        'run',
        '--exclude',
        '**/*.integration.test.ts',
        '--exclude',
        '**/*.e2e.test.ts',
        '--reporter=json',
        '--no-color',
        'src/example.test.ts',
      ])
      expect(payload.passed).toBe(true)
      expect(payload.details?.suite).toBe('unit')
      expect(payload.details?.files).toEqual([
        'src/example.test.ts',
        'src/slow.integration.test.ts',
      ])
    })

    it('rejects invalid workspace sharding inputs', async () => {
      await expect(
        wpTestTool.handler({ workspaceSharding: { maxShards: 1 }, packages: ['x'] }),
      ).rejects.toSatisfy((error: unknown) => {
        return error instanceof Error && /maxShards/i.test(error.message)
      })
      expect(spawnMock).not.toHaveBeenCalled()
    })

    it('accepts the five-minute MCP-safe maximum before spawning', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      const result = await wpTestTool.handler({ timeoutMs: 300_000, packages: ['x'] })

      expect(spawnMock).toHaveBeenCalledOnce()
      expect((result.structuredContent as { passed?: boolean }).passed).toBe(true)
    })

    it('rejects tool budgets above the MCP-safe maximum before spawning', async () => {
      await expect(wpTestTool.handler({ timeoutMs: 300_001, packages: ['x'] })).rejects.toSatisfy(
        (error: unknown) => error instanceof Error && /timeoutMs/i.test(error.message),
      )
      await expect(
        wpTestTool.handler({
          timeoutMs: 300_000,
          workspaceSharding: { totalBudgetMs: 300_001 },
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

    it('surfaces zero-test file-filter failures with diagnostics', async () => {
      spawnMock.mockReturnValue(
        fakeChild({
          stdout: JSON.stringify({
            success: false,
            numTotalTests: 0,
            numTotalTestSuites: 0,
            testResults: [],
          }),
          exitCode: 1,
        }),
      )

      const result = await wpTestTool.handler({ files: ['src/mcp/runners/test.ts'] })
      const payload = result.structuredContent as {
        passed: boolean
        rawOutput?: string
        failures?: Array<{ message: string }>
      }

      expect(payload.passed).toBe(false)
      expect(payload.rawOutput).toContain('Vitest exited unsuccessfully but reported 0 tests')
      expect(payload.failures?.[0]?.message).toContain('file filter')
    })

    it('clips long raw test output and marks it truncated', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 1 }))

      const result = await wpTestTool.handler({ packages: ['x'] })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        rawOutput?: string
        truncated?: boolean
        logPath?: string
      }
      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/tests failed for 1 package/)
      expect(payload.rawOutput).toHaveLength(4_000)
      expect(payload.truncated).toBe(true)
      expect(payload.logPath).toMatch(/^logs\//)
    })

    it('returns full raw test output when full is true', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 1 }))

      const result = await wpTestTool.handler({ packages: ['x'], full: true })
      const payload = result.structuredContent as {
        rawOutput?: string
        truncated?: boolean
        logPath?: string
      }

      expect(payload.rawOutput).toBe(`[scope: package x]\n${'x'.repeat(5_000)}\n`)
      expect(payload.truncated).toBeUndefined()
      expect(payload.logPath).toBeUndefined()
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
      spawnMock.mockReturnValue(fakeChild({ hang: true }))
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
      try {
        const result = await wpTestTool.handler({ packages: ['x'], timeoutMs: 1 })
        const payload = result.structuredContent as {
          passed: boolean
          summary: string
          timedOut?: boolean
          failures?: Array<{ message: string }>
        }

        expect(result.isError).toBe(true)
        expect(payload.passed).toBe(false)
        expect(payload.summary).toBe('tests timed out for 1 package (package x)')
        expect(payload.timedOut).toBe(true)
        expect(payload.failures?.[0]?.message).toMatch(/timed out/i)
      } finally {
        nowSpy.mockRestore()
      }
    })

    it('surfaces timed out shard scope for root vitest workspace runs', async () => {
      writeVitestWorkspace(dir)
      writeTestFiles(dir, 6)
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock
        .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
        .mockReturnValueOnce(fakeChild({ stdout: 'should-not-run\n', exitCode: 0 }))

      const result = await wpTestTool.handler({
        timeoutMs: 10,
        workspaceSharding: { concurrency: 2 },
      })
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

      const result = await wpTestTool.handler({
        timeoutMs: 10,
        workspaceSharding: { concurrency: 2 },
      })
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
