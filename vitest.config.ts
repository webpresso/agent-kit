import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

import { createVitestAliasEntriesFromPackageImports } from "./src/config/internal-subpath-imports.js";

const derivedInternalAliases = createVitestAliasEntriesFromPackageImports();

// All test trees discovered by the suite. Carried verbatim into the `unit`
// project — dropping any glob silently drops that tree from `wp test`.
export const TEST_INCLUDE = [
  "src/**/*.test.ts",
  "src/**/*.integration.test.ts",
  "scripts/**/*.test.ts",
  "bin/**/*.test.ts",
  "test/**/*.test.ts",
  "*.test.ts",
  // Published config package — its parity/isolation guards must run in CI.
  "packages/agent-config/src/**/*.test.ts",
  // Curated workflow skill text contracts must stay active in the root suite.
  "packages/workflow-skills/src/**/*.test.ts",
];

// `.claude/worktrees/` and `_worktrees/` hold full repo copies (locked OMC/agent
// worktrees). The unit project's tree-scoped includes never matched them, but the
// subprocess project's `**/*.<suffix>.test.ts` globs would — exclude them so we
// don't run duplicate/stale test files from nested worktrees.
const BASE_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/.claude/**", "**/_worktrees/**"];
const IS_CI = process.env.CI === "true";
// CI runners are 2-core, so 2 workers matches the hardware. Locally, leave most
// cores busy without globally serializing: the genuine shared-resource offenders
// are isolated into the serial-subprocess project below, so the rest of the
// subprocess lane can run with bounded parallelism safely.
const UNIT_WORKERS = IS_CI ? 2 : "75%";
const SUBPROCESS_WORKERS = IS_CI ? 2 : 4;

// Subprocess-heavy lane, classified by filename SUFFIX (not a maintained list):
//   - *.integration.test.ts / *.e2e.test.ts — established conventions
//   - *.subprocess.test.ts — plain unit tests that spawn real git/bun/node
// Tests matching these spawn external processes; run them in forked workers with
// bounded file concurrency instead of globally serializing the lane. If a file
// proves it shares mutable external state, isolate that exact offender rather
// than putting the whole subprocess project back in serial mode.
// The list is a SUFFIX GLOB, so it carries no agent-kit-internal filenames and
// never needs editing when a new heavy test is added — the author names the file.
export const SUBPROCESS_SUFFIX_GLOBS = [
  "**/*.integration.test.ts",
  "**/*.e2e.test.ts",
  "**/*.subprocess.test.ts",
];

// Files that must never run concurrently with siblings: they either build the
// shared `dist/runtime`/`bin/runtime` tree (a write-write race under parallel
// forks) or self-spawn many child processes (oversubscription). Routing is an
// explicit list, per the "isolate the exact offender" note above — not a suffix.
export const SERIAL_SUBPROCESS_GLOBS = [
  "scripts/release.integration.test.ts",
  "scripts/release.subprocess.test.ts",
  // Build the compiled runtime into the shared dist/runtime tree — concurrent
  // builds corrupt each other.
  "src/hooks/__conformance__/parity.e2e.test.ts",
  "scripts/runtime-typecheck-parity.integration.test.ts",
  // Self-spawns 4 concurrent writer processes; running copies in parallel
  // oversubscribes the machine.
  "src/blueprint/db/wal-multiwindow.integration.test.ts",
];

export default defineConfig({
  resolve: {
    alias: [
      { find: "bun:sqlite", replacement: resolve(__dirname, "src/__mocks__/bun-sqlite.ts") },
      // package.json#imports is the source of truth for internal `#...` modules.
      { find: /^#local$/, replacement: resolve(__dirname, "src/blueprint/index.ts") },
      { find: /^#index$/, replacement: resolve(__dirname, "src/blueprint/index.ts") },
      ...derivedInternalAliases,
    ],
  },
  test: {
    // Shared root config — inherited by every project via `extends: true`.
    environment: "node",
    globals: false,
    // Reset agent-session-leaked env (CLAUDE_PROJECT_DIR, WP_SKIP_UPDATE_CHECK)
    // before every test so the suite is hermetic regardless of launch env.
    setupFiles: ["./src/test-helpers/hermetic-env.ts"],
    typecheck: { tsconfig: "./tsconfig.test.json" },
    exclude: BASE_EXCLUDE,
    // Root-only: builds dist once before workers fork (idempotent via sentinel).
    globalSetup: ["./src/test-helpers/global-setup.ts"],

    // Two fork pools. `unit` and `subprocess` both run with bounded file
    // concurrency so process-spawning tests retain isolation without making the
    // whole subprocess lane serial. Routing is by the
    // include globs above, so the default `vitest run`, `vitest run <file>`, and
    // MCP shard runs all land each file in the correct pool with no CLI changes.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: TEST_INCLUDE,
          exclude: [...BASE_EXCLUDE, ...SUBPROCESS_SUFFIX_GLOBS],
          pool: "forks",
          maxWorkers: UNIT_WORKERS,
          testTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          name: "subprocess",
          include: SUBPROCESS_SUFFIX_GLOBS,
          exclude: [...BASE_EXCLUDE, ...SERIAL_SUBPROCESS_GLOBS],
          pool: "forks",
          maxWorkers: SUBPROCESS_WORKERS,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "serial-subprocess",
          include: SERIAL_SUBPROCESS_GLOBS,
          exclude: BASE_EXCLUDE,
          pool: "forks",
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
