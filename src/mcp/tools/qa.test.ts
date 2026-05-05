import { describe, expect, it, vi } from 'vitest'

const lintHandler = vi.hoisted(() => vi.fn())
const typecheckHandler = vi.hoisted(() => vi.fn())
const testHandler = vi.hoisted(() => vi.fn())

vi.mock('./lint.js', () => ({
  default: {
    name: 'ak_lint',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: lintHandler,
  },
}))

vi.mock('./typecheck.js', () => ({
  default: {
    name: 'ak_typecheck',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: typecheckHandler,
  },
}))

vi.mock('./test.js', () => ({
  default: {
    name: 'ak_test',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: testHandler,
  },
}))

import akQaTool from './qa.js'

function wrapPayload(payload: unknown): { content: { type: string; text: string }[] } {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

function delayedResolve<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

describe('ak_qa tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akQaTool.name).toBe('ak_qa')
    expect(typeof akQaTool.description).toBe('string')
    expect(akQaTool.handler).toBeTypeOf('function')
  })

  it('runs all three sub-tools concurrently (Promise.all parallelism)', async () => {
    // Fake timers make this deterministic: setTimeout callbacks never fire
    // automatically, so we can assert the call order before advancing time.
    // Wall-clock approach is inherently flaky under CPU load (CI runners).
    vi.useFakeTimers()
    try {
      lintHandler.mockReset()
      typecheckHandler.mockReset()
      testHandler.mockReset()

      lintHandler.mockImplementation(() =>
        delayedResolve(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }), 100),
      )
      typecheckHandler.mockImplementation(() =>
        delayedResolve(
          wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
          100,
        ),
      )
      testHandler.mockImplementation(() =>
        delayedResolve(
          wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
          100,
        ),
      )

      const resultPromise = akQaTool.handler({})

      // handler() calls all three via Promise.all synchronously before the
      // first await suspends. With frozen timers no setTimeout has fired yet,
      // so if all three are already called it proves parallel fan-out.
      // Sequential execution (await each) would only show lintHandler called here.
      expect(lintHandler).toHaveBeenCalledOnce()
      expect(typecheckHandler).toHaveBeenCalledOnce()
      expect(testHandler).toHaveBeenCalledOnce()

      await vi.runAllTimersAsync()
      await resultPromise
    } finally {
      vi.useRealTimers()
    }
  })

  it('aggregates passed=true when all three sub-results pass', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    const lintPayload = { passed: true, summary: 'lint passed', issues: [] }
    const typecheckPayload = { passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }
    const testPayload = { passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }

    lintHandler.mockResolvedValue(wrapPayload(lintPayload))
    typecheckHandler.mockResolvedValue(wrapPayload(typecheckPayload))
    testHandler.mockResolvedValue(wrapPayload(testPayload))

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      summary: string
      details: {
        lint: typeof lintPayload
        typecheck: typeof typecheckPayload
        test: typeof testPayload
      }
    }
    expect(result.structuredContent).toEqual(payload)

    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('qa passed')
    expect(payload.details.lint).toEqual(lintPayload)
    expect(payload.details.typecheck).toEqual(typecheckPayload)
    expect(payload.details.test).toEqual(testPayload)
  })

  it('aggregates passed=false when lint fails', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'lint failed',
        issues: [{ file: 'a.ts', line: 1, rule: 'x', message: 'y' }],
      }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [], rawOutput: '' }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      summary: string
      details: {
        lint: { passed: boolean }
        typecheck: { passed: boolean }
        test: { passed: boolean }
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('qa failed: lint')
    expect(payload.details.lint.passed).toBe(false)
    expect(payload.details.typecheck.passed).toBe(true)
    expect(payload.details.test.passed).toBe(true)
  })

  it('aggregates passed=false when test fails', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: false, summary: 'tests failed', rawOutput: 'boom', exitCode: 1, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      summary: string
      details: {
        test: { passed: boolean; exitCode: number }
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.summary).toBe('qa failed: test')
    expect(payload.details.test.passed).toBe(false)
    expect(payload.details.test.exitCode).toBe(1)
  })

  // Regression: unwrap used to silently swallow JSON parse errors and
  // non-text content blocks, returning `{passed:false, raw:...}` so a real
  // composition bug looked indistinguishable from a sub-tool returning
  // `passed:false` with empty issues. The unwrap now annotates the failure.
  it('annotates `unwrapError` when a sub-tool returns invalid JSON', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue({ content: [{ type: 'text', text: '{not json' }] })
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      details: {
        lint: { passed: boolean; unwrapError?: string }
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.details.lint.passed).toBe(false)
    expect(payload.details.lint.unwrapError).toMatch(/JSON\.parse failed/)
  })

  it('annotates `unwrapError` when a sub-tool returns a non-text content block', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue({ content: [{ type: 'image', data: 'x' }] })
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      details: {
        lint: { passed: boolean; unwrapError?: string }
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.details.lint.unwrapError).toMatch(/text content block/)
  })

  // Regression: `ak_qa` used to call sub-handlers with empty `{}`, blocking
  // any scoped run. The new schema threads `files` (→ lint+test) and
  // `packages` (→ typecheck+test) verbatim.
  it('forwards `files` to lint and test, `packages` to typecheck and test', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    await akQaTool.handler({ files: ['a.ts'], packages: ['p1'] })

    expect(lintHandler).toHaveBeenCalledWith({ files: ['a.ts'] }, undefined)
    expect(typecheckHandler).toHaveBeenCalledWith({ packages: ['p1'] }, undefined)
    expect(testHandler).toHaveBeenCalledWith({ files: ['a.ts'], packages: ['p1'] }, undefined)
  })

  // Regression: composition bugs (a sub-tool returning a non-text block or
  // unparseable JSON) now flag `isError: true` so MCP clients can tell them
  // apart from "lint legitimately found issues with passed=false".
  it('marks the result `isError: true` when a sub-tool result cannot be unwrapped', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    lintHandler.mockResolvedValue({ content: [{ type: 'text', text: '{not json' }] })
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    expect(result.isError).toBe(true)
  })

  it('does NOT mark `isError: true` when sub-tools simply report passed=false', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    lintHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'lint failed',
        issues: [{ file: 'a.ts', line: 1, rule: 'x', message: 'y' }],
      }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    expect(result.isError).toBeUndefined()
  })
})
