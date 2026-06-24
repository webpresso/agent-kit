import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach } from 'vitest';
const TEST_STATE_ROOT = mkdtempSync(path.join(tmpdir(), `wp-state-${process.pid}-`));
mkdirSync(TEST_STATE_ROOT, { recursive: true });
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
 * - `WP_BLUEPRINT_ROOTS_TIMEOUT_MS` — overrides the timeout for MCP roots
 *   fetches in blueprint discovery; a leaked value degrades all subsequent
 *   tests to a 1 ms budget, causing spurious timeout warnings.
 * - `WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS` — overrides the timeout for
 *   project discovery; same leak vector as the roots timeout above.
 * - `WP_BLUEPRINT_PLATFORM_DISABLED` — disables platform sync; a leaked '1'
 *   silently skips pushEvent calls that other tests assert are made.
 * - `GITHUB_PAT` — secret credential used by ci-act tests; must not persist
 *   between tests to prevent secret leaks and cross-test contamination.
 * - `QUALITY_ENGINE_COMPACT` — controls compact QA output mode; a leaked '0'
 *   forces passthrough mode on tests that expect the compact transform.
 * - `WP_MCP_TOOL_MODE` / `WP_COMPILED_RUNTIME` — switch MCP discovery to the
 *   compiled registry path. A leaked runtime-mode flag makes filesystem-backed
 *   MCP integration tests miss dynamically-written fixture tools.
 * - `WP_STATE_ROOT` — points repo/user state at a hermetic per-worker temp dir
 *   so projection DB tests never mutate or contend on the developer's real
 *   Webpresso state directory.
 *
 * The fix is isolation, not changing the runtime precedence: reset these before
 * every test so the suite is deterministic regardless of the launching
 * environment. Tests that exercise these variables set them explicitly in their
 * own body (which runs after this hook), so behavior coverage is unaffected.
 */
export const LEAKY_ENV_KEYS = [
    'CLAUDE_PROJECT_DIR',
    'WP_SKIP_UPDATE_CHECK',
    'WP_BLUEPRINT_ROOTS_TIMEOUT_MS',
    'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
    'WP_BLUEPRINT_PLATFORM_DISABLED',
    'WP_MCP_TOOL_MODE',
    'WP_COMPILED_RUNTIME',
    'GITHUB_PAT',
    'QUALITY_ENGINE_COMPACT',
];
/** Delete every agent-session-leaked env var so each test starts hermetic. */
export function resetLeakyEnv() {
    for (const key of LEAKY_ENV_KEYS) {
        delete process.env[key];
    }
    process.env.WP_STATE_ROOT = TEST_STATE_ROOT;
}
resetLeakyEnv();
beforeEach(resetLeakyEnv);
//# sourceMappingURL=hermetic-env.js.map