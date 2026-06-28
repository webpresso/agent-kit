/**
 * Codex CLI emitter — converts WP_HOOK_SPECS into the HooksMap format
 * that Codex CLI's hooks.json expects.
 *
 * Codex differences from Claude Code:
 * - Hook commands use absolute paths (no $CLAUDE_PROJECT_DIR env var)
 * - The HooksMap is wrapped under a top-level `hooks` key by the caller
 *   (patchCodexHooks in index.ts handles that wrapping)
 */
import { WP_HOOK_SPECS } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
/**
 * Builds the HooksMap for Codex hooks.json. Codex uses absolute paths
 * (no $CLAUDE_PROJECT_DIR). The returned map is the inner hooks object;
 * the caller is responsible for wrapping it under `{ hooks: ... }`.
 */
export function buildCodexHookGroups(input) {
    const { resolveBin, matchers, repoRoot } = input;
    const resolveForRepo = resolveBin(repoRoot);
    const result = {};
    for (const spec of WP_HOOK_SPECS) {
        const group = {
            ...(spec.matcher !== undefined ? { matcher: matchers[spec.matcher] } : {}),
            hooks: [{ type: "command", command: resolveForRepo(spec.bin), timeout: spec.timeout }],
        };
        const existing = result[spec.event] ?? [];
        result[spec.event] = [...existing, group];
    }
    return result;
}
//# sourceMappingURL=codex.js.map