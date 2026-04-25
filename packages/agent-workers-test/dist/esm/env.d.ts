import type { DurableObjectNamespace, Hyperdrive } from '@cloudflare/workers-types';
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
    ENVIRONMENT: string;
    DATABASE_URL?: string;
    HYPERDRIVE?: Hyperdrive;
}
/**
 * Creates a mock DurableObjectNamespace for testing.
 */
export declare function createMockDurableObjectNamespace(): DurableObjectNamespace;
/**
 * Creates a mock Hyperdrive binding for testing.
 *
 * @param overrides - Optional partial overrides for Hyperdrive fields
 * @returns A mock Hyperdrive instance
 */
export declare function createMockHyperdrive(overrides?: Partial<Hyperdrive>): Hyperdrive;
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
export declare function createMockEnv<T extends BaseWorkerEnv>(overrides?: Partial<T>): T;
//# sourceMappingURL=env.d.ts.map