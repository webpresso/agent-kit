import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
type HookEntry = {
    type: string;
    command: string;
    timeout?: number;
};
type HookGroup = {
    matcher?: string;
    hooks: HookEntry[];
};
type HooksMap = Record<string, HookGroup[]>;
export type MatcherSet = {
    preToolUse: string;
    postToolUse: string;
};
/**
 * Construct the canonical 5 ak-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Single source of truth — adding a
 * new ak-* hook is one append here and propagates to both surfaces.
 */
export declare function buildAgentKitHookGroups(input: {
    resolveBin: (name: string) => string;
    matchers: MatcherSet;
}): HooksMap;
/**
 * Migration: Codex's canonical hooks.json schema is wrapped under a top-level
 * `hooks` key (matching Codex's official docs at
 * https://developers.openai.com/codex/hooks). Earlier versions of this
 * scaffolder wrote event keys at the top level, which Codex silently ignored.
 *
 * Move any top-level `SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop`
 * keys into `json.hooks`, deduping via `ensureGroup`, and delete the
 * legacy top-level keys. Idempotent.
 */
export declare function hoistTopLevelEvents(json: Record<string, unknown>): Record<string, unknown>;
export interface ScaffoldAgentHooksInput {
    repoRoot: string;
    options: MergeOptions;
}
export interface ScaffoldAgentHooksResult {
    claude: MergeResult;
    codex: MergeResult;
}
export declare function scaffoldAgentHooks(input: ScaffoldAgentHooksInput): ScaffoldAgentHooksResult;
export {};
//# sourceMappingURL=index.d.ts.map