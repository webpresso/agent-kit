import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.integration.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/cli/commands/init/init.integration.test.ts',
      'src/build/generate-skills-dir.test.ts',
      'src/mcp/tools/typecheck.test.ts',
      'src/mcp/tools/test.test.ts',
    ],
    globals: false,
    testTimeout: 10_000,
    pool: 'forks',
  },
})
