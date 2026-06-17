/**
 * Shared Vitest configuration for React packages
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { reactConfig } from '@webpresso/agent-config/vitest/react'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(reactConfig, defineConfig({
 *   test: {
 *     setupFiles: ['./test/setup.ts'],
 *     env: {
 *       VITE_PUBLIC_APP_URL: 'http://localhost:3001',
 *     },
 *   },
 * }))
 * ```
 */

import type { ViteUserConfigExport } from 'vite-plus/test/config'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus/test/config'

import { createFlakinessReporter } from './flakiness-reporter.js'
import { generatedRuntimeAliases, generatedRuntimeDedupe } from './generated-runtime-aliases.js'
import {
  resolvedExecArgv,
  resolvedMaxWorkers,
  resolvedMinWorkers,
  resolvedPool,
} from './pool-defaults.js'
import { assertNonWorkersVitest4 } from './version-guard.js'

assertNonWorkersVitest4({ caller: 'reactConfig' })

export const reactConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: [...generatedRuntimeAliases],
    dedupe: generatedRuntimeDedupe,
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    restoreAllMocks: true,
    environment: 'happy-dom',
    setupFiles: [],
    onConsoleLog: () => false, // Suppress all console output
    pool: resolvedPool,
    maxWorkers: resolvedMaxWorkers,
    minWorkers: resolvedMinWorkers,
    // Cap each fork worker's V8 heap to 2GB (Node 24 default is 4.2GB).
    execArgv: resolvedExecArgv,
    include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
    reporters: ['default', createFlakinessReporter()],
    retry: process.env.CI ? 2 : 0,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'build/',
        'dist/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/index.{ts,tsx}', // Common exclusion for barrel exports
        '**/types.ts',
        '**/types.tsx',
        '**/types/**',
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
  // Pre-optimize React dependencies to prevent first-run failures
  // See: https://github.com/storybookjs/storybook/issues/32049
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
} as unknown as ViteUserConfigExport)

export default reactConfig
