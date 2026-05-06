import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  mutator: {
    // Evaluate ALL mutator types — no exclusions
    excludedMutations: [],
  },
  // Use 'command' runner — the vitest runner (perTest/all) crashes in Stryker 9.6.1
  // + vitest 2.1.9 with 'TypeError: Cannot convert object to primitive value' in
  // VitestTestRunner.errorToString during the dry run.
  testRunner: 'command',
  commandRunner: {
    // Use vitest directly with dot reporter + stryker config (excludes slow tests)
    // to minimize per-mutant overhead vs full pnpm test invocation.
    command: 'pnpm exec vitest run --reporter=dot --config vitest.stryker.config.ts',
  },
  coverageAnalysis: 'off',
  ignoreStatic: false, // ignoreStatic requires perTest; off/command mode doesn't support it
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__fixtures__/**',
  ],
  inPlace: true,
  concurrency: 6, // 8 CPUs; leave 2 for OS + Stryker orchestrator
}
