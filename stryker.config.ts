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
  // inPlace avoids sandbox copy (which crashes on directory symlinks from ak symlink sync).
  // Stryker keeps backups of originals in tempDirName before mutating.
  inPlace: true,
  concurrency: 2,
}
