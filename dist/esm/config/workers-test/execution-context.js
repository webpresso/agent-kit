import { vi } from 'vitest';
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
export function createMockExecutionContext() {
    return {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
        props: {},
    };
}
//# sourceMappingURL=execution-context.js.map