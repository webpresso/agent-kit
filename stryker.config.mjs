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
  // 'all' coverage analysis preserves vitest.config.ts pool:forks setting.
  // 'perTest' forces vmThreads which breaks tests using process.chdir().
  coverageAnalysis: 'all',
  vitest: {
    configFile: 'vitest.config.ts',
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
