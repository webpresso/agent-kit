import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const lintHandler = vi.hoisted(() => vi.fn())
const typecheckHandler = vi.hoisted(() => vi.fn())
const testHandler = vi.hoisted(() => vi.fn())
const detectUiChangesMock = vi.hoisted(() => vi.fn<[string], boolean>())

vi.mock('./_shared/ui-detection.js', () => ({
  detectUiChanges: detectUiChangesMock,
}))

vi.mock('./lint.js', () => ({
  default: {
    name: 'wp_lint',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: lintHandler,
  },
}))

vi.mock('./typecheck.js', () => ({
  default: {
    name: 'wp_typecheck',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: typecheckHandler,
  },
}))

vi.mock('./test.js', () => ({
  default: {
    name: 'wp_test',
    description: 'mocked',
    inputSchema: {} as unknown,
    handler: testHandler,
  },
}))

import wpQaTool from './qa.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

function wrapPayload(payload: unknown): {
  content: { type: string; text: string }[]
  structuredContent: Record<string, unknown>
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  }
}

function delayedResolve<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

describe('wp_qa tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(wpQaTool.name).toBe('wp_qa')
    expect(typeof wpQaTool.description).toBe('string')
    expect(wpQaTool.handler).toBeTypeOf('function')
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
        delayedResolve(wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }), 100),
      )

      const resultPromise = wpQaTool.handler({})

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
    const typecheckPayload = {
      passed: true,
      summary: 'typecheck passed',
      errorCount: 0,
      errors: [],
    }
    const testPayload = { passed: true, summary: 'tests passed', exitCode: 0 }

    lintHandler.mockResolvedValue(wrapPayload(lintPayload))
    typecheckHandler.mockResolvedValue(wrapPayload(typecheckPayload))
    testHandler.mockResolvedValue(wrapPayload(testPayload))

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
      details: {
        lint: { passed: boolean; summary: string; failures: unknown[] }
        typecheck: { passed: boolean; summary: string; failures: unknown[] }
        test: {
          passed: boolean
          summary: string
          exitCode: number
          failures: unknown[]
        }
      }
    }

    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('qa passed')
    expect((result.content[0] as { text: string }).text).toBe('qa passed')
    expect(payload.details.lint).toEqual({ passed: true, summary: 'lint passed', failures: [] })
    expect(payload.details.typecheck).toEqual({
      passed: true,
      summary: 'typecheck passed',
      failures: [],
    })
    expect(payload.details.test).toEqual({
      passed: true,
      summary: 'tests passed',
      exitCode: 0,
      failures: [],
    })
    expect(testHandler).toHaveBeenCalledWith({}, undefined)
  })

  it('preserves the qa envelope while carrying additive compact-output leaf metadata', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    const expected = JSON.parse(readFileSync(join(fixtureDir, 'qa-snapshot.json'), 'utf8')) as {
      details: {
        lint: Record<string, unknown>
        typecheck: Record<string, unknown>
        test: Record<string, unknown>
      }
    }

    lintHandler.mockResolvedValue(wrapPayload(expected.details.lint))
    typecheckHandler.mockResolvedValue(wrapPayload(expected.details.typecheck))
    testHandler.mockResolvedValue(wrapPayload(expected.details.test))

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent

    expect(payload).toEqual(expected)
  })

  it('drops nested leaf internals and raw output from sub-tools', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'lint failed',
        rawOutput: 'very long lint output',
        details: {
          issues: [{ file: 'src/a.ts', line: 3, code: 'rule-a', message: 'bad lint' }],
          extraNested: { should: 'not survive' },
        },
        tier: 1,
        bytes: 50,
        tokensSaved: 25,
      }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({
        passed: true,
        summary: 'typecheck passed',
        rawOutput: 'should not survive',
        details: { errors: [], debug: { deep: true } },
      }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'tests failed',
        rawOutput: 'huge raw output',
        details: {
          failures: [{ file: 'src/a.test.ts', message: 'expected 1 to be 2', code: 'ASSERT' }],
          nested: { giant: ['payload'] },
        },
        exitCode: 1,
      }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
      details: {
        lint: Record<string, unknown>
        typecheck: Record<string, unknown>
        test: Record<string, unknown>
      }
    }

    expect(payload.details.lint.failures).toEqual([
      { file: 'src/a.ts', line: 3, code: 'rule-a', message: 'bad lint' },
    ])
    expect(payload.details.test.failures).toEqual([
      { file: 'src/a.test.ts', code: 'ASSERT', message: 'expected 1 to be 2' },
    ])
    expect(payload.details.lint).not.toHaveProperty('details')
    expect(payload.details.lint).not.toHaveProperty('rawOutput')
    expect(payload.details.typecheck).not.toHaveProperty('details')
    expect(payload.details.typecheck).not.toHaveProperty('rawOutput')
    expect(payload.details.test).not.toHaveProperty('details')
    expect(payload.details.test).not.toHaveProperty('rawOutput')
  })

  it('forwards full to sub-tools and preserves leaf raw output when requested', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'lint passed', rawOutput: 'full lint' }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', rawOutput: 'full typecheck' }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', rawOutput: 'full tests' }),
    )

    const result = await wpQaTool.handler({ full: true, cwd: '/repo', files: ['a.ts'] })
    const payload = result.structuredContent as {
      details: {
        lint: { rawOutput?: string }
        typecheck: { rawOutput?: string }
        test: { rawOutput?: string }
      }
    }

    expect(lintHandler).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/repo', files: ['a.ts'], full: true }),
      undefined,
    )
    expect(typecheckHandler).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/repo', full: true }),
      undefined,
    )
    expect(testHandler).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/repo', files: ['a.ts'], full: true }),
      undefined,
    )
    expect(payload.details.lint.rawOutput).toBe('full lint')
    expect(payload.details.typecheck.rawOutput).toBe('full typecheck')
    expect(payload.details.test.rawOutput).toBe('full tests')
  })

  it('caps oversized nested failure lists to a bounded excerpt set', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    const nestedFailures = Array.from({ length: 25 }, (_, index) => ({
      file: `src/case-${index}.test.ts`,
      message: `failure ${index}`,
      code: 'ASSERT',
      nested: { giant: 'payload' },
    }))

    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'tests failed hard',
        details: {
          failures: nestedFailures,
          perTest: nestedFailures,
        },
        rawOutput: 'x'.repeat(200000),
        exitCode: 1,
      }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
      details: {
        test: {
          failures: Array<{ file?: string; message: string; code?: string }>
        }
      }
    }

    expect(payload.details.test.failures).toHaveLength(10)
    expect(payload.details.test.failures[0]).toEqual({
      file: 'src/case-0.test.ts',
      code: 'ASSERT',
      message: 'failure 0',
    })
    expect(Buffer.byteLength(JSON.stringify(payload.details.test))).toBeLessThanOrEqual(2048)
  })

  it('compiled output schema rejects the old leaky nested leaf shape', () => {
    const invalid = {
      passed: false,
      summary: 'qa failed: test',
      details: {
        lint: { passed: true, summary: 'lint passed', failures: [] },
        typecheck: { passed: true, summary: 'typecheck passed', failures: [] },
        test: {
          passed: false,
          summary: 'tests failed',
          failures: [{ message: 'boom' }],
          details: { giant: ['nested', 'payload'] },
          rawOutput: 'should be rejected',
        },
      },
    }

    const result = wpQaTool.outputSchema.safeParse(invalid)
    expect(result.success).toBe(false)
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
      wrapPayload({
        passed: true,
        summary: 'typecheck passed',
        errorCount: 0,
        errors: [],
        rawOutput: '',
      }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
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
      wrapPayload({
        passed: false,
        summary: 'tests failed',
        rawOutput: 'boom',
        exitCode: 1,
      }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
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
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
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
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({})
    const payload = result.structuredContent as {
      passed: boolean
      details: {
        lint: { passed: boolean; unwrapError?: string }
      }
    }

    expect(payload.passed).toBe(false)
    expect(payload.details.lint.unwrapError).toMatch(/text content block/)
  })

  // Regression: `wp_qa` used to call sub-handlers with empty `{}`, blocking
  // any scoped run. The new schema threads `files` (→ lint+test) and
  // `packages` (→ typecheck+test) verbatim.
  it('forwards files/packages to the same sub-tools as before and test budgets only to wp_test', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    await wpQaTool.handler({
      files: ['a.ts'],
      packages: ['p1'],
      timeoutMs: 5_000,
      workspaceSharding: { totalBudgetMs: 5_000 },
    })

    expect(lintHandler).toHaveBeenCalledWith({ files: ['a.ts'] }, undefined)
    expect(typecheckHandler).toHaveBeenCalledWith({ packages: ['p1'] }, undefined)
    expect(testHandler).toHaveBeenCalledWith(
      {
        files: ['a.ts'],
        packages: ['p1'],
        timeoutMs: 5_000,
        workspaceSharding: { totalBudgetMs: 5_000 },
      },
      undefined,
    )
  })

  it('rejects invalid test-budget combinations before calling any sub-tool', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    await expect(
      wpQaTool.handler({
        timeoutMs: 5_000,
        workspaceSharding: { totalBudgetMs: 6_000 },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        /totalBudgetMs/i.test(error.message) &&
        /timeoutMs/i.test(error.message),
    )

    expect(lintHandler).not.toHaveBeenCalled()
    expect(typecheckHandler).not.toHaveBeenCalled()
    expect(testHandler).not.toHaveBeenCalled()
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
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({})
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
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({})
    expect(result.isError).toBeUndefined()
  })

  it('appends the UI tail-hint to summary when QA passes and UI files are detected', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    detectUiChangesMock.mockReturnValue(true)

    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({ cwd: '/some/repo' })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
    }

    expect(payload.passed).toBe(true)
    expect(payload.summary).toContain('qa passed')
    expect(payload.summary).toContain('Static QA passed. For visual/UX QA, run /qa (gstack).')
  })

  it('does NOT append the UI tail-hint when QA fails even with UI files', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    detectUiChangesMock.mockReturnValue(true)

    lintHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        summary: 'lint failed',
        issues: [{ file: 'Button.tsx', line: 1, rule: 'x', message: 'y' }],
      }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({ cwd: '/some/repo' })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
    }

    expect(payload.passed).toBe(false)
    expect(payload.summary).not.toContain('Static QA passed')
    expect(payload.summary).toBe('qa failed: lint')
  })

  it('does NOT append the UI tail-hint when QA passes but no UI files detected', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()
    detectUiChangesMock.mockReturnValue(false)

    lintHandler.mockResolvedValue(wrapPayload({ passed: true, summary: 'lint passed', issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'typecheck passed', errorCount: 0, errors: [] }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, summary: 'tests passed', exitCode: 0 }),
    )

    const result = await wpQaTool.handler({ cwd: '/some/repo' })
    const payload = result.structuredContent as {
      passed: boolean
      summary: string
    }

    expect(payload.passed).toBe(true)
    expect(payload.summary).toBe('qa passed')
  })
})
