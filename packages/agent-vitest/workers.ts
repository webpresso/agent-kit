import { defineConfig } from 'vite-plus/test/config'

import { createFlakinessReporter } from './flakiness-reporter.js'
import { assertVitest4 } from './version-guard.js'

assertVitest4({ caller: 'workersConfig' })

/**
 * Shared Vitest configuration for Cloudflare Workers
 */
export const workersConfig = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    restoreMocks: true,
    reporters: ['default', createFlakinessReporter() as never],
    retry: process.env.CI ? 2 : 0,
    coverage: {
      // Use istanbul provider for Edge Runtime compatibility
      // v8 provider requires node:inspector which is not available in Edge Runtime
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/.stryker-tmp/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
      // Industry-standard 80% coverage thresholds (Atlassian recommendation)
      // 80% catches critical gaps without excessive build failures
      // Branches at 75% as they're harder to cover comprehensively
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
})

export default workersConfig
