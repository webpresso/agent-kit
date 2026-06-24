import { defineConfig } from 'vitest/config'
import vitestConfig, { SUBPROCESS_SUFFIX_GLOBS, TEST_INCLUDE } from './vitest.config.js'

// Stryker drives vitest via its own forks-pool runner and cannot use the
// two-project (`unit`/`subprocess`) topology from vitest.config.ts — so this is
// a FLAT, project-free config (it reuses only `resolve`, not the projects).
// It excludes every subprocess-heavy test by SUFFIX GLOB
// (*.integration/*.e2e/*.subprocess), which collapses the former hand-maintained
// per-file exclude list: each previously-listed file now ends in one of those
// suffixes, so the glob covers them and stays correct as new heavy tests are added.
export default defineConfig({
  resolve: vitestConfig.resolve,
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test-helpers/hermetic-env.ts'],
    typecheck: { tsconfig: './tsconfig.test.json' },
    globalSetup: ['./src/test-helpers/global-setup.ts'],
    // forks pool prevents IPC serialization crash (TypeError: Cannot convert
    // object to primitive value) in VitestTestRunner.errorToString with Stryker 9.x
    pool: 'forks',
    include: TEST_INCLUDE,
    exclude: ['**/node_modules/**', '**/dist/**', ...SUBPROCESS_SUFFIX_GLOBS],
  },
})
