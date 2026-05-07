import { defineConfig, mergeConfig } from 'vitest/config'
import vitestConfig from './vitest.config.js'

export default mergeConfig(
  vitestConfig,
  defineConfig({
    test: {
      // forks pool prevents IPC serialization crash (TypeError: Cannot convert object
      // to primitive value) in VitestTestRunner.errorToString with Stryker 9.x
      pool: 'forks',
      exclude: [
        ...(vitestConfig.test?.exclude ?? ['**/node_modules/**', '**/dist/**']),
        'src/hooks/pretool-guard/runner.test.ts',
        'src/cli/commands/init/init.e2e.test.ts',
      ],
    },
  }),
)
