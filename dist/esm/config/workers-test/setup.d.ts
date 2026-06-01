import type { BaseWorkerEnv } from './env.js';
import type { MockExecutionContext } from './execution-context.js';
import { createMockExecutionContext } from './execution-context.js';
import { createCloudflareRuntimeMocks } from './durable-objects.js';
import { createAuthenticatedRequest, createUnauthenticatedRequest, createCorsRequest } from './requests.js';
/**
 * Options for configuring the worker test environment
 */
export interface WorkerTestOptions {
    /** Enable Cloudflare Workers runtime mocking (DurableObject, Container) (default: true) */
    mockCloudflareRuntime?: boolean;
}
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
export declare function setupWorkerTest<T extends BaseWorkerEnv>(envOverrides?: Partial<T>, options?: WorkerTestOptions): {
    mocks: {
        cloudflareRuntime: ReturnType<typeof createCloudflareRuntimeMocks> | null;
    };
    mockEnv: T;
    mockCtx: MockExecutionContext;
    createAuthenticatedRequest: typeof createAuthenticatedRequest;
    createUnauthenticatedRequest: typeof createUnauthenticatedRequest;
    createCorsRequest: typeof createCorsRequest;
    createMockExecutionContext: typeof createMockExecutionContext;
    clearAllMocks: () => void;
};
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
export declare function suppressConsole(): {
    restore: () => void;
};
//# sourceMappingURL=setup.d.ts.map