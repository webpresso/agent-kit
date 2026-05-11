import { vi } from 'vitest';
// ============================================================================
// Mock Classes
// ============================================================================
/**
 * Mock DurableObject class for unit tests.
 * Use this when you need to mock a DurableObject class in your test setup.
 *
 * @example
 * ```typescript
 * vi.mock('cloudflare:workers', () => ({
 *   DurableObject: MockDurableObject,
 * }))
 * ```
 */
export class MockDurableObject {
    state;
    env;
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }
}
/**
 * Mock Container class for unit tests.
 * Use this when you need to mock a Cloudflare Container in your test setup.
 *
 * @example
 * ```typescript
 * vi.mock('@cloudflare/containers', () => ({
 *   Container: MockContainer,
 * }))
 * ```
 */
export class MockContainer {
    defaultPort = 8080;
    sleepAfter = '1m';
    envVars = {};
    enableInternet = false;
    fetch = vi.fn();
    destroy = vi.fn();
    startAndWaitForPorts = vi.fn();
    getState = vi.fn().mockResolvedValue({ status: 'running' });
}
// ============================================================================
// Mock Factories
// ============================================================================
/**
 * Creates mock Cloudflare Workers runtime modules.
 * Includes DurableObject and Container classes that are only available in workerd.
 *
 * Use this in vitest module mocks:
 *
 * @example
 * ```typescript
 * const mocks = createCloudflareRuntimeMocks()
 * vi.mock('cloudflare:workers', () => mocks['cloudflare:workers'])
 * vi.mock('@cloudflare/containers', () => mocks['@cloudflare/containers'])
 * ```
 */
export function createCloudflareRuntimeMocks() {
    return {
        'cloudflare:workers': {
            DurableObject: MockDurableObject,
        },
        '@cloudflare/containers': {
            Container: MockContainer,
        },
    };
}
//# sourceMappingURL=durable-objects.js.map