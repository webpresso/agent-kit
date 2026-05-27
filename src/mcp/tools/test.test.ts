import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import akTestTool from './test.js'

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
    expect(akTestTool.name).toBe('wp_test')
    expect(typeof akTestTool.description).toBe('string')
    expect(akTestTool.handler).toBeTypeOf('function')
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

      const result = await akTestTool.handler({ packages: ['x'] })
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

      await akTestTool.handler({ packages: ['x'], files: ['src/example.test.ts'] })
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
      await expect(akTestTool.handler({ suite: 'e2e', packages: ['x'] })).rejects.toSatisfy(
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

    it('clips long raw test output and marks it truncated', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 1 }))

      const result = await akTestTool.handler({ packages: ['x'] })
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

    it('threads MCP cancellation into the underlying test process', async () => {
      const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
      spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))
      const controller = new AbortController()

      const promise = akTestTool.handler({ packages: ['x'] }, { signal: controller.signal })
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

      const result = await akTestTool.handler({ packages: ['x'], timeoutMs: 1 })
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        timedOut?: boolean
        failures?: Array<{ message: string }>
      }

      expect(killCapture.signal).toBe('SIGTERM')
      expect(result.isError).toBe(true)
      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('tests timed out for 1 package')
      expect(payload.timedOut).toBe(true)
      expect(payload.failures?.[0]?.message).toMatch(/timed out/i)
    })
  })
})
