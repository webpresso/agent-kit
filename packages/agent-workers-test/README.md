# @webpresso/workers-test-kit

Production-ready Cloudflare Workers test mocks. Drop in `BaseWorkerEnv`, `ExecutionContext`, `Hyperdrive`, Durable Object, and Container mocks for any Cloudflare Workers project without recreating them per-app.

## Installation

```bash
npm install --save-dev @webpresso/workers-test-kit
# peer dependencies
npm install --save-dev vitest @cloudflare/workers-types
```

## Usage

```typescript
import {
  createMockEnv,
  createMockExecutionContext,
  createAuthenticatedRequest,
} from '@webpresso/workers-test-kit'

it('should handle a request', async () => {
  const env = createMockEnv()
  const ctx = createMockExecutionContext()
  const req = createAuthenticatedRequest('/api/hello')
  const res = await app.fetch(req, env, ctx)
  expect(res.status).toBe(200)
})
```

## Extending BaseWorkerEnv with your bindings

`BaseWorkerEnv` is intentionally minimal. Extend it with your app-specific bindings:

```typescript
import type { BaseWorkerEnv } from '@webpresso/workers-test-kit'
import type { DurableObjectNamespace } from '@cloudflare/workers-types'

// Example: Webpresso's internal env
interface WebpressoWorkerEnv extends BaseWorkerEnv {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  BETTER_AUTH_SECRET: string
  ENCRYPTION_KEY: string
  GRAPHQL_ADMIN_SECRET: string
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
  CHEF_URL: string
  ADMIN_WEB_URL?: string
  GRAPHQL_CONTAINERS: DurableObjectNamespace
  ENABLE_QUERY_TIMING?: string
}

// Use it in tests:
const env = createMockEnv<WebpressoWorkerEnv>({
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  BETTER_AUTH_SECRET: 'test-auth-secret',
  ENCRYPTION_KEY: 'test-encryption-key-32-characters',
  GRAPHQL_ADMIN_SECRET: 'test-secret',
  CF_ACCESS_TEAM_DOMAIN: '',
  CF_ACCESS_AUD: '',
  CHEF_URL: 'http://localhost:4003',
  GRAPHQL_CONTAINERS: createMockDurableObjectNamespace(),
})
```

## API

### Environment

- `BaseWorkerEnv` — minimal env interface: `{ ENVIRONMENT: string; DATABASE_URL?: string; HYPERDRIVE?: Hyperdrive }`
- `createMockEnv<T>(overrides?)` — create a mock env with sensible defaults
- `createMockHyperdrive(overrides?)` — create a mock Hyperdrive binding
- `createMockDurableObjectNamespace()` — create a mock DurableObjectNamespace

### ExecutionContext

- `MockExecutionContext` — type with mocked `waitUntil` and `passThroughOnException`
- `createMockExecutionContext()` — create a mock ExecutionContext

### Durable Objects and Containers

- `MockDurableObject` — mock DurableObject class
- `MockContainer` — mock Container class with `fetch`, `destroy`, `startAndWaitForPorts`, `getState`
- `createCloudflareRuntimeMocks()` — returns `{ 'cloudflare:workers': { DurableObject }, '@cloudflare/containers': { Container } }`

### Request Helpers

- `createAuthenticatedRequest(path, options?, baseUrl?)` — request with `Cookie: session=...`
- `createUnauthenticatedRequest(path, options?, baseUrl?)` — request without cookies
- `createCorsRequest(path, origin, options?, baseUrl?)` — request with `Origin` header

### Test Setup

- `setupWorkerTest<T>(envOverrides?, options?)` — convenience wrapper returning `{ mockEnv, mockCtx, mocks, ...helpers }`
- `suppressConsole()` — suppress console output; call `.restore()` in `afterEach`

## Peer Dependencies

| Package | Version |
|---------|---------|
| `vitest` | `>=1.0.0` |
| `@cloudflare/workers-types` | `>=4.0.0` |

## Notes

- `Hyperdrive` API may change across major `@cloudflare/workers-types` releases. Pin a minimum version and check release notes when upgrading.
- This package is pool-agnostic. `@cloudflare/vitest-pool-workers` (if you use it) remains a devDependency of your app, not this package.
