import { vi } from 'vitest';
// ============================================================================
// Mock Factories
// ============================================================================
/**
 * Creates a mock DurableObjectNamespace for testing.
 */
export function createMockDurableObjectNamespace() {
    return {
        newUniqueId: vi.fn(() => ({
            toString: () => 'test-do-id',
            equals: () => false,
            name: undefined,
        })),
        idFromName: vi.fn((name) => ({
            toString: () => `do-${name}`,
            equals: () => false,
            name,
        })),
        idFromString: vi.fn((id) => ({
            toString: () => id,
            equals: () => false,
            name: undefined,
        })),
        get: vi.fn(async () => ({
            fetch: vi.fn(async () => new Response(JSON.stringify({ data: {} }))),
        })),
        getByName: vi.fn(async () => ({
            fetch: vi.fn(async () => new Response(JSON.stringify({ data: {} }))),
        })),
    };
}
/**
 * Creates a mock Hyperdrive binding for testing.
 *
 * @param overrides - Optional partial overrides for Hyperdrive fields
 * @returns A mock Hyperdrive instance
 */
export function createMockHyperdrive(overrides) {
    return {
        connectionString: 'postgresql://localhost/test',
        connect: vi.fn(() => ({})),
        host: 'localhost',
        port: 5432,
        user: 'test',
        password: 'test',
        database: 'test',
        ...overrides,
    };
}
/**
 * Creates a mock environment with sensible defaults.
 * Override specific values by passing them in the overrides parameter.
 *
 * @param overrides - Partial environment to merge with defaults
 * @returns Complete environment object for worker tests
 *
 * @example
 * ```typescript
 * const env = createMockEnv<MyWorkerEnv>({ MY_API_KEY: 'test-key' })
 * ```
 */
export function createMockEnv(overrides = {}) {
    const defaultEnv = {
        ENVIRONMENT: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        HYPERDRIVE: createMockHyperdrive(),
    };
    return {
        ...defaultEnv,
        ...overrides,
    };
}
//# sourceMappingURL=env.js.map