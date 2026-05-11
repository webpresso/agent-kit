/**
 * @webpresso/agent-workers-test
 *
 * Production-ready Cloudflare Workers test mocks.
 * Drop in BaseWorkerEnv, ExecutionContext, Hyperdrive, and Durable Object mocks
 * for any Cloudflare Workers project without recreating them per-app.
 */

// Environment types and factories
export type { BaseWorkerEnv } from './env.js'
export { createMockEnv, createMockHyperdrive, createMockDurableObjectNamespace } from './env.js'

// ExecutionContext
export type { MockExecutionContext } from './execution-context.js'
export { createMockExecutionContext } from './execution-context.js'

// Durable Objects and Containers
export { MockDurableObject, MockContainer, createCloudflareRuntimeMocks } from './durable-objects.js'

// Request helpers
export { createAuthenticatedRequest, createUnauthenticatedRequest, createCorsRequest } from './requests.js'

// Test setup
export type { WorkerTestOptions } from './setup.js'
export { setupWorkerTest, suppressConsole } from './setup.js'
