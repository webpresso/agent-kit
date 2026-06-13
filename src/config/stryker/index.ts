/**
 * Shared mutation-testing defaults for Webpresso packages.
 *
 * Import and extend this in package-root `stryker.config.mjs` files:
 *
 * @example
 * import { baseConfig } from '@webpresso/agent-kit/stryker'
 *
 * export default {
 *   ...baseConfig,
 *   vitest: { configFile: 'vitest.node.config.ts' },
 *   mutate: ['src/**\/*.ts', '!src/**\/*.test.ts'],
 * }
 */
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
    '**/.opencode/**',
    '**/.omx/**',
    '**/dist/**',
    '**/coverage/**',
    '**/*.d.ts',
  ],

  // Default mutate patterns - exclude all test files.
  // Individual packages can override or extend these patterns.
  mutate: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'apps/**/*.ts',
    'apps/**/*.tsx',
    'packages/**/*.ts',
    'packages/**/*.tsx',
    'infra/**/*.ts',
    'infra/**/*.tsx',
    'scripts/**/*.ts',
    'scripts/**/*.tsx',
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/*.spec.ts',
    '!**/*.spec.tsx',
    '!**/*.integration.test.ts',
    '!**/*.integration.test.tsx',
    '!**/*.workers.test.ts',
    '!**/*.e2e.ts',
    '!**/*.d.ts',
    '!**/__fixtures__/**',
    '!**/fixtures/**',
    '!**/generated/**',
    '!src/quality-sample.ts',
  ],

  // Performance settings.
  concurrency: 4,
  timeoutMS: 60000,
  dryRunTimeoutMinutes: 10,
  // Static mutants (module-level constants) can't be activated per-test — they require
  // a fresh process per mutant, which is extremely slow. Ignore them instead.
  ignoreStatic: true,

  // Run the full configured test surface by default. Consumer repos often mutate
  // files that are not directly imported from tests, so Vitest related-only selection
  // can yield zero executed tests.
  vitest: { related: false },

  // Quality thresholds.
  thresholds: {
    high: 85,
    low: 80,
    break: 75,
  },

  // Exclude cosmetic mutations that don't affect behavior.
  // This focuses mutation testing on actual business logic.
  mutator: {
    excludedMutations: ['StringLiteral', 'ArrayDeclaration'],
  },

  // Reporting.
  reporters: ['html', 'clear-text', 'progress-append-only', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation-report.json',
  },

  // Incremental mutation testing - caches results to avoid re-running unchanged code.
  // Results stored in reports/stryker-incremental.json.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
}

/**
 * Extends baseConfig with TypeScript checker defaults.
 * Use this in any TypeScript package instead of baseConfig directly.
 *
 * @example
 * import { typescriptBaseConfig } from '@webpresso/agent-kit/stryker'
 *
 * export default { ...typescriptBaseConfig }
 * // or, for packages with a CF-pool vitest config:
 * export default { ...typescriptBaseConfig, vitest: { configFile: 'vitest.stryker.config.ts' } }
 */
export const typescriptBaseConfig = {
  ...baseConfig,
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
}

/**
 * Extends typescriptBaseConfig for Cloudflare Workers packages whose vitest config
 * uses @cloudflare/vitest-pool-workers (incompatible with Stryker's pool injection).
 * Points to a per-package vitest.stryker.config.ts that uses the standard forks pool
 * and excludes any tests that require CF runtime globals (cloudflare:test).
 *
 * @example
 * import { typescriptWorkersBaseConfig } from '@webpresso/agent-kit/stryker'
 *
 * export default { ...typescriptWorkersBaseConfig }
 */
export const typescriptWorkersBaseConfig = {
  ...typescriptBaseConfig,
  vitest: { configFile: 'vitest.stryker.config.ts' },
}

export default baseConfig
