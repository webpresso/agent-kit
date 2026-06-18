import { afterEach, describe, expect, it, vi } from 'vitest'

import akLintTool from './lint.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(
  opts: {
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: NodeJS.ErrnoException
  } = {},
): unknown {
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

afterEach(() => {
  spawnMock.mockReset()
})

describe('wp_lint tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akLintTool.name).toBe('wp_lint')
    expect(typeof akLintTool.description).toBe('string')
    expect(akLintTool.handler).toBeTypeOf('function')
  })

  it('invokes vp lint with --format=json and the supplied files', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({ files: ['a.ts', 'b.ts'] })

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['lint', '--format=json', 'a.ts', 'b.ts'])
  })

  it('invokes vp lint against `.` when no files supplied', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({})

    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['lint', '--format=json', '.'])
  })

  it('adds --fix when requested', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    await akLintTool.handler({ files: ['a.ts'], fix: true })

    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['lint', '--format=json', '--fix', 'a.ts'])
  })

  it('returns {passed: true, issues: []} when vp lint exits 0', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '[]', exitCode: 0 }))

    const result = await akLintTool.handler({ files: ['a.ts'] })
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload).toMatchObject({
      passed: true,
      summary: 'lint passed via vp lint',
      counts: { issueCount: 0 },
      details: { issues: [] },
    })
    expect((result.content[0] as { text: string }).text).toBe('lint passed via vp lint')
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
    const payload = result.structuredContent as {
      passed: boolean
      summary?: string
      details: {
        issues: Array<{ file: string; line: number; rule: string; message: string }>
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('lint failed with 3 issues via vp lint')
    expect(payload.details.issues).toHaveLength(3)
    expect(payload.details.issues[0]).toEqual({
      file: '/abs/path/a.ts',
      line: 12,
      rule: 'no-unused-vars',
      message: 'unused variable: x',
    })
    expect(payload.details.issues[1]).toEqual({
      file: '/abs/path/a.ts',
      line: 30,
      rule: 'no-console',
      message: 'unexpected console statement',
    })
    expect(payload.details.issues[2]).toEqual({
      file: '/abs/path/b.ts',
      line: 5,
      rule: 'eqeqeq',
      message: 'expected === and got ==',
    })
  })

  // Regression: parseOxlintIssues used to silently return [] on JSON parse
  // failure. Caller saw `{passed:false, issues:[]}` and concluded "lint failed
  // with no specific issues" — masking the parse bug. Now annotated.
  it('annotates `parseError` when oxlint stdout is not valid JSON', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '{not json', exitCode: 1 }))

    const result = await akLintTool.handler({})
    const payload = result.structuredContent as {
      passed: boolean
      summary?: string
      details?: { issues: unknown[]; parseError?: string }
    }
    expect(payload.passed).toBe(false)
    expect(payload.details?.issues).toEqual([])
    expect(payload.summary).toBe('lint failed: could not parse vp lint output')
    expect(payload.details?.parseError).toMatch(/oxlint JSON\.parse failed/)
  })

  it('annotates `parseError` when oxlint stdout is JSON but not an array', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '{"x": 1}', exitCode: 1 }))

    const result = await akLintTool.handler({})
    const payload = result.structuredContent as {
      details?: { parseError?: string }
    }
    expect(payload.details?.parseError).toMatch(/not a JSON array/)
  })

  it('parses wrapped oxlint object output with a non-json prelude', async () => {
    spawnMock.mockReturnValue(
      fakeChild({
        stdout:
          'No files found to lint. Please check your paths and ignore patterns.\\n' +
          JSON.stringify({
            diagnostics: [
              {
                filePath: 'a.ts',
                messages: [{ line: 1, ruleId: 'parse', message: 'Unexpected token' }],
              },
            ],
          }),
        exitCode: 1,
      }),
    )

    const result = await akLintTool.handler({ files: ['a.ts'] })
    const payload = result.structuredContent as {
      passed: boolean
      counts?: { issueCount: number }
      details?: {
        issues: Array<{ file: string; rule: string; message: string }>
        parseError?: string
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.counts?.issueCount).toBe(1)
    expect(payload.details?.parseError).toBeUndefined()
    expect(payload.details?.issues[0]).toMatchObject({
      file: 'a.ts',
      rule: 'parse',
      message: 'Unexpected token',
    })
  })

  it('surfaces vp lint spawn failures instead of hiding them', async () => {
    const eperm = new Error('spawn vp EPERM') as NodeJS.ErrnoException
    eperm.code = 'EPERM'
    spawnMock.mockReturnValue(fakeChild({ error: eperm }))

    const result = await akLintTool.handler({})
    expect(spawnMock.mock.calls.length).toBe(1)
    const payload = result.structuredContent as {
      passed: boolean
      summary?: string
      details?: { spawnError?: string }
    }
    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('lint could not start: vp lint spawn failed')
    expect(payload.details?.spawnError).toMatch(/EPERM/)
  })

  // Regression: spawn-failure paths are real execution errors per MCP spec —
  // the tool didn't run, the agent can't fix it by retrying with new inputs.
  // Must set `isError: true` so MCP clients can distinguish from
  // "lint genuinely found issues with passed=false".
  it('sets `isError: true` when vp lint spawn fails', async () => {
    const eperm = new Error('spawn vp EPERM') as NodeJS.ErrnoException
    eperm.code = 'EPERM'
    spawnMock.mockReturnValue(fakeChild({ error: eperm }))

    const result = await akLintTool.handler({})
    expect(result.isError).toBe(true)
  })

  it('does NOT set `isError: true` when lint runs and reports issues normally', async () => {
    spawnMock.mockReturnValue(
      fakeChild({
        stdout: '[{"filePath":"a.ts","messages":[{"line":1,"ruleId":"x","message":"y"}]}]',
        exitCode: 1,
      }),
    )

    const result = await akLintTool.handler({})
    expect(result.isError).toBeUndefined()
  })

  it('returns full lint output when full is true', async () => {
    const output = 'x'.repeat(5_000)
    spawnMock.mockReturnValue(fakeChild({ stdout: output, exitCode: 1 }))

    const result = await akLintTool.handler({ full: true })
    const payload = result.structuredContent as { rawOutput?: string; truncated?: boolean }

    expect(payload.rawOutput).toBe(output)
    expect(payload.truncated).toBeUndefined()
  })
})
