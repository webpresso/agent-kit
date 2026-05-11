import { baseConfig } from '@webpresso/agent-stryker'

export default {
  ...baseConfig,
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts', '!src/**/__fixtures__/**'],
}
