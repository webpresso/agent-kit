import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import akTypecheckTool from './typecheck.js'

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

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR

afterEach(() => {
  spawnMock.mockReset()
  if (originalProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR
  } else {
    process.env.CLAUDE_PROJECT_DIR = originalProjectDir
  }
})

describe('wp_typecheck tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akTypecheckTool.name).toBe('wp_typecheck')
    expect(typeof akTypecheckTool.description).toBe('string')
    expect(akTypecheckTool.handler).toBeTypeOf('function')
  })

  describe('argv', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), `wp-mcp-typecheck-${randomUUID().slice(0, 8)}-`))
      process.env.CLAUDE_PROJECT_DIR = dir
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('spawns once per package with `--noEmit -p <path>` when packages given', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      await akTypecheckTool.handler({ packages: ['a', 'b'] })

      expect(spawnMock).toHaveBeenCalledTimes(2)
      const [cmd0, args0] = spawnMock.mock.calls[0]!
      const [cmd1, args1] = spawnMock.mock.calls[1]!
      expect(cmd0).toBe('vp')
      expect(args0).toEqual(['exec', 'tsc', '--noEmit', '-p', join('a', 'tsconfig.json')])
      expect(cmd1).toBe('vp')
      expect(args1).toEqual(['exec', 'tsc', '--noEmit', '-p', join('b', 'tsconfig.json')])
    })

    it('spawns plain `tsc --noEmit` when no packages given', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      await akTypecheckTool.handler({})

      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect(cmd).toBe('vp')
      expect(args).toEqual(['exec', 'tsc', '--noEmit'])
    })
  })

  describe('output parsing', () => {
    it('parses tsc errors from stdout into structured entries', async () => {
      spawnMock.mockReturnValue(
        fakeChild({
          stdout: "src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.\n",
          exitCode: 1,
        }),
      )

      const result = await akTypecheckTool.handler({})
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        counts: { errorCount: number }
        details: { errors: { file: string; line: number; code: string; message: string }[] }
      }

      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('typecheck failed with 1 error')
      expect(payload.counts.errorCount).toBe(1)
      expect(payload.details.errors).toHaveLength(1)
      expect(payload.details.errors[0]).toEqual({
        file: 'src/foo.ts',
        line: 5,
        code: '2304',
        message: "Cannot find name 'bar'.",
      })
    })

    it('returns passed=true with zero errors when tsc succeeds', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      const result = await akTypecheckTool.handler({})
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        counts: { errorCount: number }
        details: { errors: unknown[] }
      }

      expect(payload).toMatchObject({
        passed: true,
        summary: 'typecheck passed',
        counts: { errorCount: 0 },
        details: { errors: [] },
      })
      expect((result.content[0] as { text: string }).text).toBe('typecheck passed')
    })

    it('clips long raw typecheck output and marks it truncated', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 1 }))

      const result = await akTypecheckTool.handler({})
      const payload = result.structuredContent as {
        rawOutput?: string
        truncated?: boolean
      }
      expect(payload.rawOutput).toHaveLength(4_000)
      expect(payload.truncated).toBe(true)
    })
  })
})
