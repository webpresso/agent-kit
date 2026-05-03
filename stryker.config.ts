import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
  thresholds: {
    ...baseConfig.thresholds,
    high: 50,
    low: 40,
    break: 40,
  },
  vitest: {
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
