import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

import { createVitestAliasEntriesFromPackageImports } from './src/config/internal-subpath-imports.js'

const derivedInternalAliases = createVitestAliasEntriesFromPackageImports()

export default defineConfig({
  resolve: {
    alias: [
      { find: 'bun:sqlite', replacement: resolve(__dirname, 'src/__mocks__/bun-sqlite.ts') },
      { find: /^#local$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      { find: /^#index$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      ...derivedInternalAliases,
    ],
  },
  test: {
    environment: 'node',
    benchmark: {
      include: ['tests/perf/**/*.bench.ts'],
    },
    globals: false,
  },
})
