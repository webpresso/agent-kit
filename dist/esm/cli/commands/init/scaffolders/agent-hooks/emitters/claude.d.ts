/**
 * Claude Code emitter — converts WP_HOOK_SPECS into the HooksMap format
 * that Claude Code's settings.json `hooks` key expects.
 *
 * Extracted from buildWebpressoHookGroups in index.ts. The function
 * buildWebpressoHookGroups in index.ts now delegates here for backward compat.
 */
import type { HooksMap, MatcherSet } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
/**
 * Converts WP_HOOK_SPECS into the HooksMap format that Claude Code's
 * settings.json expects. Each spec becomes a HookGroup under the matching
 * event key. Specs with a `matcher` key reference the corresponding field
 * in the provided MatcherSet.
 */
export declare function buildClaudeHookGroups(input: {
    resolveBin: (name: string) => string;
    matchers: MatcherSet;
}): HooksMap;
//# sourceMappingURL=claude.d.ts.map