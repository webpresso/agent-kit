import { vi } from 'vitest';
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
export declare class MockDurableObject {
    state: unknown;
    env: unknown;
    constructor(state: unknown, env: unknown);
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
export declare class MockContainer {
    defaultPort: number;
    sleepAfter: string;
    envVars: Record<string, string>;
    enableInternet: boolean;
    fetch: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    startAndWaitForPorts: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
}
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
export declare function createCloudflareRuntimeMocks(): {
    'cloudflare:workers': {
        DurableObject: typeof MockDurableObject;
    };
    '@cloudflare/containers': {
        Container: typeof MockContainer;
    };
};
//# sourceMappingURL=durable-objects.d.ts.map