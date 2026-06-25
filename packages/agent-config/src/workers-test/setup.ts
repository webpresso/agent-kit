import { vi } from "vitest";

import type { BaseWorkerEnv } from "./env.js";
import type { MockExecutionContext } from "./execution-context.js";

import { createMockEnv } from "./env.js";
import { createMockExecutionContext } from "./execution-context.js";
import { createCloudflareRuntimeMocks } from "./durable-objects.js";
import {
  createAuthenticatedRequest,
  createUnauthenticatedRequest,
  createCorsRequest,
} from "./requests.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Options for configuring the worker test environment
 */
export interface WorkerTestOptions {
  /** Enable Cloudflare Workers runtime mocking (DurableObject, Container) (default: true) */
  mockCloudflareRuntime?: boolean;
}

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
export function setupWorkerTest<T extends BaseWorkerEnv>(
  envOverrides: Partial<T> = {},
  options: WorkerTestOptions = {},
): {
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
} {
  const { mockCloudflareRuntime = true } = options;

  const mocks = {
    cloudflareRuntime: mockCloudflareRuntime ? createCloudflareRuntimeMocks() : null,
  };

  const mockEnv = createMockEnv<T>(envOverrides);
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
export function suppressConsole(): { restore: () => void } {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  vi.spyOn(console, "log").mockImplementation(() => {
    // Intentionally empty - suppressing console output
  });
  vi.spyOn(console, "error").mockImplementation(() => {
    // Intentionally empty - suppressing console output
  });
  vi.spyOn(console, "warn").mockImplementation(() => {
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
