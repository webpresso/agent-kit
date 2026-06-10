import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

import { createVitestAliasEntriesFromPackageImports } from './src/config/internal-subpath-imports.js'

const derivedInternalAliases = createVitestAliasEntriesFromPackageImports()

export default defineConfig({
  resolve: {
    alias: [
      { find: 'bun:sqlite', replacement: resolve(__dirname, 'src/__mocks__/bun-sqlite.ts') },
      // package.json#imports is the source of truth for internal `#...` modules.
      // Vitest derives its runtime aliases from that contract so new aliases
      // land in Node + dist + tests together instead of drifting per-surface.
      { find: /^#local$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      { find: /^#index$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      ...derivedInternalAliases,
    ],
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.integration.test.ts',
      'scripts/**/*.test.ts',
      '*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Reset agent-session-leaked env (CLAUDE_PROJECT_DIR, WP_SKIP_UPDATE_CHECK)
    // before every test so the suite is hermetic regardless of launch env.
    globalSetup: ['./src/test-helpers/global-setup.ts'],
    setupFiles: ['./src/test-helpers/hermetic-env.ts'],
    globals: false,
    testTimeout: 10_000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
