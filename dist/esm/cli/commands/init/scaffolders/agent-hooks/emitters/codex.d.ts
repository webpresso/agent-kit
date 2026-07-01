/**
 * Codex CLI emitter — converts WP_HOOK_SPECS into the HooksMap format
 * that Codex CLI's hooks.json expects.
 *
 * Codex differences from Claude Code:
 * - Hook commands use absolute paths (no $CLAUDE_PROJECT_DIR env var)
 * - The HooksMap is wrapped under a top-level `hooks` key by the caller
 *   (patchCodexHooks in index.ts handles that wrapping)
 */
import type { HooksMap, MatcherSet } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
/**
 * Builds the HooksMap for Codex hooks.json. Codex uses absolute paths
 * (no $CLAUDE_PROJECT_DIR). The returned map is the inner hooks object;
 * the caller is responsible for wrapping it under `{ hooks: ... }`.
 */
export declare function buildCodexHookGroups(input: {
    resolveBin: (repoRoot: string) => (name: string) => string;
    matchers: MatcherSet;
    repoRoot: string;
}): HooksMap;
//# sourceMappingURL=codex.d.ts.map