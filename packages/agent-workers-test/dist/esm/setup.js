import { vi } from 'vitest';
import { createMockEnv } from './env.js';
import { createMockExecutionContext } from './execution-context.js';
import { createCloudflareRuntimeMocks } from './durable-objects.js';
import { createAuthenticatedRequest, createUnauthenticatedRequest, createCorsRequest } from './requests.js';
// ============================================================================
// Test Setup Function
// ============================================================================
/**
 * Sets up common worker test environment with mocks.
 * Call this in beforeEach() or at the top of your test file with vi.mock().
 *
 * @param envOverrides - Partial environment overrides
 * @param options - Configuration for which mocks to enable
 * @returns Object with mock instances for use in tests
 *
 * @example
 * ```typescript
 * const { mockEnv, mockCtx } = setupWorkerTest()
 *
 * beforeEach(() => {
 *   vi.clearAllMocks()
 * })
 *
 * it('should handle request', async () => {
 *   const request = createAuthenticatedRequest('/api/test')
 *   const response = await app.fetch(request, mockEnv, mockCtx)
 *   expect(response.status).toBe(200)
 * })
 * ```
 */
export function setupWorkerTest(envOverrides = {}, options = {}) {
    const { mockCloudflareRuntime = true } = options;
    const mocks = {
        cloudflareRuntime: mockCloudflareRuntime ? createCloudflareRuntimeMocks() : null,
    };
    const mockEnv = createMockEnv(envOverrides);
    const mockCtx = createMockExecutionContext();
    return {
        mocks,
        mockEnv,
        mockCtx,
        createAuthenticatedRequest,
        createUnauthenticatedRequest,
        createCorsRequest,
        createMockExecutionContext,
        clearAllMocks: () => vi.clearAllMocks(),
    };
}
// ============================================================================
// Console Mocking Helpers
// ============================================================================
/**
 * Suppress console output during tests.
 * Call restore() in afterEach to restore console methods.
 *
 * @returns Object with restore function to restore console methods
 *
 * @example
 * ```typescript
 * const consoleControl = suppressConsole()
 * afterEach(() => consoleControl.restore())
 * ```
 */
export function suppressConsole() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    vi.spyOn(console, 'log').mockImplementation(() => {
        // Intentionally empty - suppressing console output
    });
    vi.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty - suppressing console output
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {
        // Intentionally empty - suppressing console output
    });
    return {
        restore: () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        },
    };
}
//# sourceMappingURL=setup.js.map