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
  // 'perTest' crashes in Stryker 9.6.1 + vitest 2.1.9 with IPC serialization error.
  // 'all' collects joint coverage then runs only tests that cover each mutant.
  coverageAnalysis: 'all',
  // ignoreStatic requires 'perTest'; disable it so 'all' mode works.
  ignoreStatic: false,
  vitest: {
    // Excludes dist-binary integration tests (runner.test.ts, init.e2e.test.ts)
    configFile: 'vitest.stryker.config.ts',
  },
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__fixtures__/**',
  ],
  inPlace: true,
  concurrency: 2,
}
