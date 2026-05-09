import { baseConfig } from '@webpresso/stryker-config'

const config = {
  ...baseConfig,
  thresholds: {
    high: 85,
    low: 85,
    break: 85,
  },
  mutator: {
    excludedMutations: [],
  },
  // vitest-runner@9.6.1 crashes (TypeError: Cannot convert object to primitive value
  // in errorToString) when vitest returns non-serializable test errors. Use command
  // runner until the upstream bug is fixed in vitest-runner.
  testRunner: 'command',
  commandRunner: {
    command: 'pnpm exec vitest run --reporter=dot --config vitest.stryker.config.ts',
  },
  coverageAnalysis: 'off',
  ignoreStatic: false,
  // inPlace:true — no sandbox copy overhead. The previous inPlace:false was added after
  // a mid-run pkill left source files instrumented; start clean and this is safe.
  inPlace: true,
  // incremental: only re-test mutants affected by code changes after the first run
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  concurrency: 6,
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts', '!src/**/__fixtures__/**'],
}

export default config
