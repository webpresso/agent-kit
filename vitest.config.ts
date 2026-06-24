import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

import { createVitestAliasEntriesFromPackageImports } from './src/config/internal-subpath-imports.js'

const derivedInternalAliases = createVitestAliasEntriesFromPackageImports()

// All test trees discovered by the suite. Carried verbatim into the `unit`
// project — dropping any glob silently drops that tree from `wp test`.
export const TEST_INCLUDE = [
  'src/**/*.test.ts',
  'src/**/*.integration.test.ts',
  'scripts/**/*.test.ts',
  'bin/**/*.test.ts',
  'test/**/*.test.ts',
  '*.test.ts',
  // Published config package — its parity/isolation guards must run in CI.
  'packages/agent-config/src/**/*.test.ts',
]

// `.claude/worktrees/` and `_worktrees/` hold full repo copies (locked OMC/agent
// worktrees). The unit project's tree-scoped includes never matched them, but the
// subprocess project's `**/*.<suffix>.test.ts` globs would — exclude them so we
// don't run duplicate/stale test files from nested worktrees.
const BASE_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.claude/**',
  '**/_worktrees/**',
]

// Subprocess-heavy lane, classified by filename SUFFIX (not a maintained list):
//   - *.integration.test.ts / *.e2e.test.ts — established conventions
//   - *.subprocess.test.ts — plain unit tests that spawn real git/bun/node
// Tests matching these spawn external processes; running them in the parallel
// pool oversubscribes the machine and trips the 10s budget (see the original
// maxWorkers note). They run serially (fileParallelism:false) at a 30s budget.
// The list is a SUFFIX GLOB, so it carries no agent-kit-internal filenames and
// never needs editing when a new heavy test is added — the author names the file.
export const SUBPROCESS_SUFFIX_GLOBS = [
  '**/*.integration.test.ts',
  '**/*.e2e.test.ts',
  '**/*.subprocess.test.ts',
]

export default defineConfig({
  resolve: {
    alias: [
      { find: 'bun:sqlite', replacement: resolve(__dirname, 'src/__mocks__/bun-sqlite.ts') },
      // package.json#imports is the source of truth for internal `#...` modules.
      { find: /^#local$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      { find: /^#index$/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      ...derivedInternalAliases,
    ],
  },
  test: {
    // Shared root config — inherited by every project via `extends: true`.
    environment: 'node',
    globals: false,
    // Reset agent-session-leaked env (CLAUDE_PROJECT_DIR, WP_SKIP_UPDATE_CHECK)
    // before every test so the suite is hermetic regardless of launch env.
    setupFiles: ['./src/test-helpers/hermetic-env.ts'],
    typecheck: { tsconfig: './tsconfig.test.json' },
    exclude: BASE_EXCLUDE,
    // Root-only: builds dist once before workers fork (idempotent via sentinel).
    globalSetup: ['./src/test-helpers/global-setup.ts'],

    // Two pools. `unit` runs parallel (fast); `subprocess` runs serial so the
    // process-spawning tests can't oversubscribe the machine. Routing is by the
    // include globs above, so the default `vitest run`, `vitest run <file>`, and
    // MCP shard runs all land each file in the correct pool with no CLI changes.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: TEST_INCLUDE,
          exclude: [...BASE_EXCLUDE, ...SUBPROCESS_SUFFIX_GLOBS],
          maxWorkers: 4,
          testTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'subprocess',
          include: SUBPROCESS_SUFFIX_GLOBS,
          exclude: BASE_EXCLUDE,
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
