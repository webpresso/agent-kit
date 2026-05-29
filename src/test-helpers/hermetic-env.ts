import { beforeEach } from 'vitest'

/**
 * Hermetic environment baseline for the whole test suite.
 *
 * agent-kit's suite is routinely run *inside* an agent session (Claude Code,
 * Codex), and those sessions export ambient variables that the production code
 * legitimately honors at runtime:
 *
 * - `CLAUDE_PROJECT_DIR` — `resolveProjectRoot` (src/mcp/tools/_shared/project-root.ts)
 *   ranks this above the discovered cwd, so a leaked value makes blueprint-server
 *   tests target the real repo + its shared SQLite DB instead of their temp dir,
 *   producing wrong-data assertions and lock-contention timeouts.
 * - `WP_SKIP_UPDATE_CHECK` — suppresses the managed-CLI refresh spawn that the
 *   init scaffolder tests assert fires; a leaked value (exported by the shell or
 *   left behind by a sibling test file under the shared forks worker) drops the
 *   expected spawn and fails spawn-count assertions.
 *
 * The fix is isolation, not changing the runtime precedence: reset these before
 * every test so the suite is deterministic regardless of the launching
 * environment. Tests that exercise these variables set them explicitly in their
 * own body (which runs after this hook), so behavior coverage is unaffected.
 */
export const LEAKY_ENV_KEYS = ['CLAUDE_PROJECT_DIR', 'WP_SKIP_UPDATE_CHECK'] as const

/** Delete every agent-session-leaked env var so each test starts hermetic. */
export function resetLeakyEnv(): void {
  for (const key of LEAKY_ENV_KEYS) {
    delete process.env[key]
  }
}

beforeEach(resetLeakyEnv)
