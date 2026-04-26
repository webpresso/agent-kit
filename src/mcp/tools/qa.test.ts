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
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
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
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    const STEP_MS = 50

    lintHandler.mockImplementation(() =>
      delayedResolve(wrapPayload({ passed: true, issues: [] }), STEP_MS),
    )
    typecheckHandler.mockImplementation(() =>
      delayedResolve(wrapPayload({ passed: true, errorCount: 0, errors: [], output: '' }), STEP_MS),
    )
    testHandler.mockImplementation(() =>
      delayedResolve(
        wrapPayload({ passed: true, output: '', exitCode: 0, backend: 'pnpm' }),
        STEP_MS,
      ),
    )

    const start = Date.now()
    await akQaTool.handler({})
    const elapsed = Date.now() - start

    expect(lintHandler).toHaveBeenCalledOnce()
    expect(typecheckHandler).toHaveBeenCalledOnce()
    expect(testHandler).toHaveBeenCalledOnce()

    // If sequential, elapsed would be ~3 * STEP_MS = 150ms.
    // Parallel via Promise.all should be ~STEP_MS (with a generous tolerance).
    expect(elapsed).toBeLessThan(STEP_MS * 2.5)
  })

  it('aggregates passed=true when all three sub-results pass', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    const lintPayload = { passed: true, issues: [] }
    const typecheckPayload = { passed: true, errorCount: 0, errors: [], output: '' }
    const testPayload = { passed: true, output: '', exitCode: 0, backend: 'pnpm' }

    lintHandler.mockResolvedValue(wrapPayload(lintPayload))
    typecheckHandler.mockResolvedValue(wrapPayload(typecheckPayload))
    testHandler.mockResolvedValue(wrapPayload(testPayload))

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      lint: typeof lintPayload
      typecheck: typeof typecheckPayload
      test: typeof testPayload
    }

    expect(payload.passed).toBe(true)
    expect(payload.lint).toEqual(lintPayload)
    expect(payload.typecheck).toEqual(typecheckPayload)
    expect(payload.test).toEqual(testPayload)
  })

  it('aggregates passed=false when lint fails', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(
      wrapPayload({
        passed: false,
        issues: [{ file: 'a.ts', line: 1, rule: 'x', message: 'y' }],
      }),
    )
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, errorCount: 0, errors: [], output: '' }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: true, output: '', exitCode: 0, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      lint: { passed: boolean }
      typecheck: { passed: boolean }
      test: { passed: boolean }
    }

    expect(payload.passed).toBe(false)
    expect(payload.lint.passed).toBe(false)
    expect(payload.typecheck.passed).toBe(true)
    expect(payload.test.passed).toBe(true)
  })

  it('aggregates passed=false when test fails', async () => {
    lintHandler.mockReset()
    typecheckHandler.mockReset()
    testHandler.mockReset()

    lintHandler.mockResolvedValue(wrapPayload({ passed: true, issues: [] }))
    typecheckHandler.mockResolvedValue(
      wrapPayload({ passed: true, errorCount: 0, errors: [], output: '' }),
    )
    testHandler.mockResolvedValue(
      wrapPayload({ passed: false, output: 'boom', exitCode: 1, backend: 'pnpm' }),
    )

    const result = await akQaTool.handler({})
    const payload = JSON.parse((result.content[0] as { text: string }).text) as {
      passed: boolean
      test: { passed: boolean; exitCode: number }
    }

    expect(payload.passed).toBe(false)
    expect(payload.test.passed).toBe(false)
    expect(payload.test.exitCode).toBe(1)
  })
})
