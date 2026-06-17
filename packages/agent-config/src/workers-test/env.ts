import type { DurableObjectNamespace, Hyperdrive } from './cloudflare-types.js'

import { vi } from 'vitest'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Minimal common-denominator environment interface for Cloudflare Workers tests.
 *
 * Extend this in your project to add your own bindings:
 * ```typescript
 * interface MyWorkerEnv extends BaseWorkerEnv {
 *   MY_KV: KVNamespace
 *   MY_API_KEY: string
 * }
 * ```
 *
 * @example
 * // Webpresso example:
 * interface WebpressoWorkerEnv extends BaseWorkerEnv {
 *   GOOGLE_CLIENT_ID: string
 *   GOOGLE_CLIENT_SECRET: string
 *   BETTER_AUTH_SECRET: string
 *   ENCRYPTION_KEY: string
 *   GRAPHQL_ADMIN_SECRET: string
 *   CF_ACCESS_TEAM_DOMAIN: string
 *   CF_ACCESS_AUD: string
 *   CHEF_URL: string
 *   ADMIN_WEB_URL?: string
 *   GRAPHQL_CONTAINERS: DurableObjectNamespace
 *   ENABLE_QUERY_TIMING?: string
 * }
 */
export interface BaseWorkerEnv {
  ENVIRONMENT: string
  DATABASE_URL?: string
  HYPERDRIVE?: Hyperdrive
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock DurableObjectNamespace for testing.
 */
export function createMockDurableObjectNamespace(): DurableObjectNamespace {
  return {
    newUniqueId: vi.fn<(...args: unknown[]) => unknown>(() => ({
      toString: () => 'test-do-id',
      equals: () => false,
      name: undefined,
    })),
    idFromName: vi.fn((name: string) => ({
      toString: () => `do-${name}`,
      equals: () => false,
      name,
    })),
    idFromString: vi.fn((id: string) => ({
      toString: () => id,
      equals: () => false,
      name: undefined,
    })),
    get: vi.fn<(...args: unknown[]) => unknown>(async () => ({
      fetch: vi.fn<(...args: unknown[]) => unknown>(
        async () => new Response(JSON.stringify({ data: {} })),
      ),
    })),
    getByName: vi.fn<(...args: unknown[]) => unknown>(async () => ({
      fetch: vi.fn<(...args: unknown[]) => unknown>(
        async () => new Response(JSON.stringify({ data: {} })),
      ),
    })),
  } as unknown as DurableObjectNamespace
}

/**
 * Creates a mock Hyperdrive binding for testing.
 *
 * @param overrides - Optional partial overrides for Hyperdrive fields
 * @returns A mock Hyperdrive instance
 */
export function createMockHyperdrive(overrides?: Partial<Hyperdrive>): Hyperdrive {
  return {
    connectionString: 'postgresql://localhost/test',
    connect: vi.fn<(...args: unknown[]) => unknown>(() => ({}) as unknown),
    host: 'localhost',
    port: 5432,
    user: 'test',
    password: 'test',
    database: 'test',
    ...overrides,
  } as unknown as Hyperdrive
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
export function createMockEnv<T extends BaseWorkerEnv>(overrides: Partial<T> = {}): T {
  const defaultEnv: BaseWorkerEnv = {
    ENVIRONMENT: 'test',
    DATABASE_URL: 'postgresql://localhost/test',
    HYPERDRIVE: createMockHyperdrive(),
  }

  return {
    ...defaultEnv,
    ...overrides,
  } as T
}
