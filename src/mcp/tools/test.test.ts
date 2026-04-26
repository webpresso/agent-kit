import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import akTestTool from './test.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(opts: { stdout?: string; stderr?: string; exitCode?: number } = {}): unknown {
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
    on: (event: string, fn: (code: number) => void) => {
      if (event === 'close') queueMicrotask(() => fn(opts.exitCode ?? 0))
    },
  }
}

const originalCwd = process.cwd()

afterEach(() => {
  spawnMock.mockReset()
  process.chdir(originalCwd)
})

describe('ak_test tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akTestTool.name).toBe('ak_test')
    expect(typeof akTestTool.description).toBe('string')
    expect(akTestTool.handler).toBeTypeOf('function')
  })

  describe('backend routing', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'ak-mcp-test-tool-'))
      process.chdir(dir)
    })

    it('routes to `just` when justfile is present', async () => {
      writeFileSync(join(dir, 'justfile'), 'test:\n\techo ok\n')
      spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      const result = await akTestTool.handler({ packages: ['x'] })
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('just')
      expect(args).toEqual(['test', '--package', 'x'])
      // Result is wrapped in MCP content blocks with JSON-serialized payload.
      expect(result.content[0]).toMatchObject({ type: 'text' })
      const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<
        string,
        unknown
      >
      expect(payload).toMatchObject({ passed: true, exitCode: 0 })
    })

    it('routes to `pnpm` when only pnpm-workspace.yaml is present', async () => {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      await akTestTool.handler({ packages: ['x'] })
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('pnpm')
      expect(args).toEqual(['-F', 'x', 'test'])
    })

    it('honors explicit backend override', async () => {
      writeFileSync(join(dir, 'justfile'), 'test:\n\techo ok\n')
      spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      await akTestTool.handler({ packages: ['x'], backend: 'pnpm' })
      const [cmd] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('pnpm')
    })
  })
})
