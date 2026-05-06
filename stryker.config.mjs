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
  vitest: {
    // Excludes dist-binary integration tests that can't run in vmThreads workers
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
