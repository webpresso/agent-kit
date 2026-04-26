import { afterEach, describe, expect, it, vi } from 'vitest'

import akLintTool from './lint.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: NodeJS.ErrnoException
} = {}): unknown {
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
    on: (event: string, fn: (arg: unknown) => void) => {
      if (event === 'error' && opts.error) {
        queueMicrotask(() => fn(opts.error))
        return
      }
      if (event === 'close' && !opts.error) {
        queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
  }
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error('spawn oxlint ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('ak_lint tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akLintTool.name).toBe('ak_lint')
    expect(typeof akLintTool.description).toBe('string')
    expect(akLintTool.handler).toBeTypeOf('function')
  })

  it('invokes oxlint with --format=json and the supplied files', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({ files: ['a.ts', 'b.ts'] })

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('oxlint')
    expect(args).toEqual(['--format=json', 'a.ts', 'b.ts'])
  })

  it('invokes oxlint against `.` when no files supplied', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({})

    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('oxlint')
    expect(args).toEqual(['--format=json', '.'])
  })

  it('adds --fix when requested', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({ files: ['a.ts'], fix: true })

    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['--format=json', '--fix', 'a.ts'])
  })

  it('returns {passed: true, issues: []} when oxlint exits 0', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    const result = await akLintTool.handler({ files: ['a.ts'] })
    const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<
      string,
      unknown
    >
    expect(payload).toMatchObject({ passed: true, issues: [] })
  })

  it('parses oxlint JSON output into structured issues', async () => {
    const oxlintReport = JSON.stringify([
      {
        filePath: '/abs/path/a.ts',
        messages: [
          {
            line: 12,
            column: 4,
            ruleId: 'no-unused-vars',
            message: 'unused variable: x',
            severity: 2,
          },
          {
            line: 30,
            column: 1,
            ruleId: 'no-console',
            message: 'unexpected console statement',
            severity: 2,
          },
        ],
      },
      {
        filePath: '/abs/path/b.ts',
        messages: [
          {
            line: 5,
            column: 2,
            ruleId: 'eqeqeq',
            message: 'expected === and got ==',
            severity: 2,
          },
        ],
      },
    ])
    spawnMock.mockReturnValue(fakeChild({ stdout: oxlintReport, exitCode: 1 }))

    const result = await akLintTool.handler({ files: ['a.ts', 'b.ts'] })
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      issues: Array<{ file: string; line: number; rule: string; message: string }>
    }

    expect(payload.passed).toBe(false)
    expect(payload.issues).toHaveLength(3)
    expect(payload.issues[0]).toEqual({
      file: '/abs/path/a.ts',
      line: 12,
      rule: 'no-unused-vars',
      message: 'unused variable: x',
    })
    expect(payload.issues[1]).toEqual({
      file: '/abs/path/a.ts',
      line: 30,
      rule: 'no-console',
      message: 'unexpected console statement',
    })
    expect(payload.issues[2]).toEqual({
      file: '/abs/path/b.ts',
      line: 5,
      rule: 'eqeqeq',
      message: 'expected === and got ==',
    })
  })

  it('falls back to `pnpm lint` when oxlint binary is missing (ENOENT)', async () => {
    spawnMock
      .mockReturnValueOnce(fakeChild({ error: enoent() }))
      .mockReturnValueOnce(fakeChild({ stdout: 'lint ok\n', exitCode: 0 }))

    const result = await akLintTool.handler({ files: ['a.ts'] })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    const [firstCmd] = spawnMock.mock.calls[0]!
    const [secondCmd, secondArgs] = spawnMock.mock.calls[1]!
    expect(firstCmd).toBe('oxlint')
    expect(secondCmd).toBe('pnpm')
    expect(secondArgs).toEqual(['lint'])

    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      issues: unknown[]
      output?: string
      backend?: string
    }
    expect(payload.passed).toBe(true)
    expect(payload.issues).toEqual([])
    expect(payload.backend).toBe('pnpm')
    expect(payload.output).toContain('lint ok')
  })
})
