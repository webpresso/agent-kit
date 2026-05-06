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
  // 'perTest' crashes in Stryker 9.6.1 + vitest 2.1.9 with IPC serialization error
  // ("Cannot convert object to primitive value") in VitestTestRunner.dryRun.
  // 'off' runs all tests for every mutant — matches how the April 2026 baseline
  // was produced (command runner mode) and avoids the crash entirely.
  coverageAnalysis: 'off',
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
