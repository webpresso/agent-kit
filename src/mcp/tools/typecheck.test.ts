import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  function write(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }

  it('exposes the expected descriptor surface', () => {
    expect(akTypecheckTool.name).toBe('wp_typecheck')
    expect(typeof akTypecheckTool.description).toBe('string')
    expect(akTypecheckTool.handler).toBeTypeOf('function')
  })

  describe('argv', () => {
    let dir: string

    beforeEach(() => {
      dir = realpathSync(
        mkdtempSync(join(tmpdir(), `wp-mcp-typecheck-${randomUUID().slice(0, 8)}-`)),
      )
      write(
        join(dir, 'package.json'),
        JSON.stringify({ name: '@webpresso/agent-kit', private: true }),
      )
      write(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      write(join(dir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n')
      write(
        join(dir, 'packages/a/package.json'),
        JSON.stringify({ name: '@scope/a', private: true }),
      )
      write(join(dir, 'packages/a/tsconfig.json'), '{"compilerOptions":{"strict":true}}\n')
      write(join(dir, 'packages/a/src/a.ts'), 'export const a = 1\n')
      write(
        join(dir, 'packages/b/package.json'),
        JSON.stringify({ name: '@scope/b', private: true }),
      )
      write(join(dir, 'packages/b/tsconfig.json'), '{"compilerOptions":{"strict":true}}\n')
      write(join(dir, 'packages/b/src/b.ts'), 'export const b = 1\n')
      write(join(dir, 'src/root.ts'), 'export const root = 1\n')
      process.env.CLAUDE_PROJECT_DIR = dir
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('spawns once per exact package scope when packages are given', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      await akTypecheckTool.handler({ packages: ['@scope/a', '@scope/b'] })

      expect(spawnMock).toHaveBeenCalledTimes(2)
      const [cmd0, args0, opts0] = spawnMock.mock.calls[0]!
      const [cmd1, args1, opts1] = spawnMock.mock.calls[1]!
      expect([cmd0, ...args0].join(' ')).toContain('typescript')
      expect(args0).toEqual(expect.arrayContaining(['--noEmit', '--pretty', 'false']))
      expect(opts0).toEqual(expect.objectContaining({ cwd: join(dir, 'packages/a') }))
      expect([cmd1, ...args1].join(' ')).toContain('typescript')
      expect(args1).toEqual(expect.arrayContaining(['--noEmit', '--pretty', 'false']))
      expect(opts1).toEqual(expect.objectContaining({ cwd: join(dir, 'packages/b') }))
    })

    it('resolves file targets to their owning scopes', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      await akTypecheckTool.handler({ files: ['src/root.ts', 'packages/a/src/a.ts'] })

      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(spawnMock.mock.calls.map((call) => call[2]?.cwd)).toEqual([
        dir,
        join(dir, 'packages/a'),
      ])
    })

    it('spawns plain `tsc --noEmit` when no packages given', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: '', exitCode: 0 }))

      await akTypecheckTool.handler({})

      expect(spawnMock).toHaveBeenCalledTimes(1)
      const [cmd, args] = spawnMock.mock.calls[0]!
      expect([cmd, ...args].join(' ')).toContain('typescript')
      expect(args).toEqual(expect.arrayContaining(['--noEmit', '--pretty', 'false']))
    })

    it('rejects files and packages together', async () => {
      await expect(
        akTypecheckTool.handler({ files: ['src/root.ts'], packages: ['@scope/a'] }),
      ).rejects.toThrow(/Cannot use both files and packages/i)
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

    it('bounds a runner failure (non-zero exit, no diagnostics) under the QA budget and logs it', async () => {
      // Mirrors a broken consumer toolchain: the tsc runner crashes with a Node
      // stack on stderr (no tsc-format diagnostics) instead of emitting errors.
      const nodeStack = `node:internal/modules/cjs/loader:1479\n  throw err;\n  ^\nError: Cannot find module '/x/vite-plus/bin/vp'\n${'    at Module._resolveFilename (node:internal/modules/cjs/loader)\n'.repeat(40)}`
      spawnMock.mockReturnValue(fakeChild({ stderr: nodeStack, exitCode: 1 }))

      const result = await akTypecheckTool.handler({})
      const payload = result.structuredContent as {
        passed: boolean
        summary: string
        counts: { errorCount: number }
        rawOutput?: string
        truncated?: boolean
        logPath?: string
        bytes?: number
      }

      expect(payload.passed).toBe(false)
      expect(payload.summary).toBe('typecheck failed to run (no diagnostics parsed)')
      expect(payload.counts.errorCount).toBe(0)
      // The whole point: evidence stays inside the compact QA leaf budget…
      expect(payload.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(800)
      expect(Buffer.byteLength(payload.rawOutput ?? '')).toBeLessThanOrEqual(600)
      // …and the full output is preserved in a log rather than dropped.
      expect(payload.truncated).toBe(true)
      expect(payload.logPath).toBeTruthy()
    })

    it('keeps the 4000 generic clip for long output that is not a bare failure', async () => {
      // passed=true with no diagnostics → passthrough at the generic 4000 cap,
      // unaffected by the runner-failure bound.
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 0 }))

      const result = await akTypecheckTool.handler({})
      const payload = result.structuredContent as { rawOutput?: string; truncated?: boolean }
      expect(payload.rawOutput).toHaveLength(4_000)
      expect(payload.truncated).toBe(true)
    })

    it('returns full raw typecheck output when full is true', async () => {
      spawnMock.mockReturnValue(fakeChild({ stdout: 'x'.repeat(5_000), exitCode: 0 }))

      const result = await akTypecheckTool.handler({ full: true })
      const payload = result.structuredContent as { rawOutput?: string; truncated?: boolean }

      expect(payload.rawOutput).toHaveLength(5_000)
      expect(payload.truncated).toBeUndefined()
    })
  })
})
