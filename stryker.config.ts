import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  mutator: {
    excludedMutations: [],
  },
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__fixtures__/**',
  ],
  // Exclude symlinked IDE skill dirs — Stryker's copyfile cannot handle symlinks to directories
  ignorePatterns: ['.agents', '.gemini', '.cursor', '.windsurf', '__fixtures__/fake-home'],
  concurrency: 2,
}
