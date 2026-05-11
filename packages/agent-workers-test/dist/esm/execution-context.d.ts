import type { ExecutionContext } from '@cloudflare/workers-types';
import { vi } from 'vitest';
/**
 * ExecutionContext mock for worker tests
 */
export type MockExecutionContext = ExecutionContext<unknown> & {
    waitUntil: ReturnType<typeof vi.fn>;
    passThroughOnException: ReturnType<typeof vi.fn>;
};
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
export declare function createMockExecutionContext(): MockExecutionContext;
//# sourceMappingURL=execution-context.d.ts.map