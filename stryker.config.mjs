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
  // VitestTestRunner.errorToString during the dry run. The command runner delegates
  // to 'pnpm test' which uses vitest.config.ts with pool:forks (same as April 2026).
  testRunner: 'command',
  commandRunner: {
    command: 'pnpm test',
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
  concurrency: 2,
}
