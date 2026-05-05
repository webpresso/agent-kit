import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  mutator: {
    excludedMutations: [],
  },
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__fixtures__/**',
  ],
  // Stryker sandbox cannot copyfile directory symlinks (ENOTSUP on macOS).
  // IDE-synced skill dirs (.agents, .cursor, .gemini, .windsurf) are generated
  // by ak symlink sync; .claude/worktrees are temporary agent execution dirs.
  ignorePatterns: [
    '.agents/**',
    '.gemini/**',
    '.cursor/**',
    '.windsurf/**',
    '.claude/worktrees/**',
    '__fixtures__/fake-home/**',
  ],
  concurrency: 2,
}
