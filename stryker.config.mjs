import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
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
