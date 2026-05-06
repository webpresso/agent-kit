import { defineConfig, mergeConfig } from 'vitest/config'
import vitestConfig from './vitest.config.js'

/**
 * Vitest config for Stryker mutation testing.
 *
 * Excludes tests that spawn compiled dist/ binaries — those tests can never
 * kill mutants (mutations target .ts source, not compiled output) and they
 * crash in Stryker's vmThreads worker pool used for perTest coverage analysis.
 */
export default mergeConfig(vitestConfig, defineConfig({
  test: {
    // Force forks pool — perTest coverage plugin causes "Cannot convert object
    // to primitive value" serialization errors in vmThreads (Stryker's default).
    pool: 'forks',
    exclude: [
      ...(vitestConfig.test?.exclude ?? ['**/node_modules/**', '**/dist/**']),
      'src/hooks/pretool-guard/runner.test.ts',
      'src/cli/commands/init/init.e2e.test.ts',
    ],
  },
}))
