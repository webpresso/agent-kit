import { vi } from 'vitest'

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
  state: unknown
  env: unknown

  constructor(state: unknown, env: unknown) {
    this.state = state
    this.env = env
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
  defaultPort = 8080
  sleepAfter = '1m'
  envVars: Record<string, string> = {}
  enableInternet = false
  fetch: ReturnType<typeof vi.fn> = vi.fn<(...args: unknown[]) => unknown>()
  destroy: ReturnType<typeof vi.fn> = vi.fn<(...args: unknown[]) => unknown>()
  startAndWaitForPorts: ReturnType<typeof vi.fn> = vi.fn<(...args: unknown[]) => unknown>()
  getState = vi.fn<() => Promise<{ status: string }>>().mockResolvedValue({ status: 'running' })
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
export function createCloudflareRuntimeMocks(): {
  'cloudflare:workers': {
    DurableObject: typeof MockDurableObject
  }
  '@cloudflare/containers': {
    Container: typeof MockContainer
  }
} {
  return {
    'cloudflare:workers': {
      DurableObject: MockDurableObject,
    },
    '@cloudflare/containers': {
      Container: MockContainer,
    },
  }
}
