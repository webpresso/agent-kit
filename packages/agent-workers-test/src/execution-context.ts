import type { ExecutionContext } from '@cloudflare/workers-types'

import { vi } from 'vitest'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * ExecutionContext mock for worker tests
 */
export type MockExecutionContext = ExecutionContext<unknown> & {
  waitUntil: ReturnType<typeof vi.fn>
  passThroughOnException: ReturnType<typeof vi.fn>
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock ExecutionContext for worker tests.
 *
 * @example
 * ```typescript
 * const ctx = createMockExecutionContext()
 * const response = await app.fetch(request, env, ctx)
 * expect(ctx.waitUntil).not.toHaveBeenCalled()
 * ```
 */
export function createMockExecutionContext(): MockExecutionContext {
  return {
    waitUntil: vi.fn<(...args: unknown[]) => unknown>() as unknown as (
      promise: Promise<unknown>,
    ) => void,
    passThroughOnException: vi.fn<(...args: unknown[]) => unknown>() as unknown as () => void,
    props: {},
  } as MockExecutionContext
}
