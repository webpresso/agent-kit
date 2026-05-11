/**
 * Stryker Base Configuration
 *
 * Shared mutation testing configuration for the Webpresso monorepo.
 * Import and extend this in individual package stryker.config.mjs files.
 *
 * @example
 * import { baseConfig } from '@webpresso/agent-stryker'
 *
 * export default {
 *   ...baseConfig,
 *   vitest: { configFile: 'vitest.node.config.ts' },
 *   mutate: ['src/**\/*.ts', '!src/**\/*.test.ts'],
 * }
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export const baseConfig = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  ignorePatterns: [
    '**/.git/**',
    '**/node_modules/**',
    '**/.stryker-tmp/**',
    '**/.agent/**',
    '**/.agents/**',
    '**/.claude/**',
    '**/.codex/**',
    '**/.cursor/**',
    '**/.gemini/**',
    '**/.windsurf/**',
    '**/.opencode/**',
    '**/.omx/**',
    '**/dist/**',
    '**/coverage/**',
    '**/*.d.ts',
  ],

  // Default mutate patterns - exclude all test files
  // Individual packages can override or extend these patterns
  mutate: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/**/*.spec.ts',
    '!src/**/*.spec.tsx',
    '!src/**/*.d.ts',
  ],

  // Performance settings
  concurrency: 4,
  timeoutMS: 60000,
  dryRunTimeoutMinutes: 10,
  // Static mutants (module-level constants) can't be activated per-test — they require
  // a fresh process per mutant, which is extremely slow. Ignore them instead.
  ignoreStatic: true,

  // Quality thresholds
  thresholds: {
    high: 85, // Green in report (target)
    low: 80, // Yellow in report (warning)
    break: 75, // Local CI fails below this (hard floor)
  },

  // Exclude cosmetic mutations that don't affect behavior
  // This focuses mutation testing on actual business logic
  mutator: {
    excludedMutations: [
      'StringLiteral', // Console.log messages, error strings (cosmetic)
      'ArrayDeclaration', // [] -> ["Stryker"] - tests array counts if needed
    ],
  },

  // Reporting
  reporters: ['html', 'clear-text', 'progress-append-only', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation-report.json',
  },

  // Incremental mutation testing - caches results to avoid re-running unchanged code
  // Results stored in reports/stryker-incremental.json
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
}

export default baseConfig
