import { defineConfig } from 'vitest/config'

// tier-boundaries.js uses `new URL('../../../package-boundaries.js', import.meta.url)`
// which resolves to the tooling workspace root (3 levels up from src/).
// tooling/package-boundaries.js provides the required stub for tests.

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['*.test.ts'],
    name: 'oxlint-plugins',
  },
})
