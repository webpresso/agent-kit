/**
 * Hook conformance matrix — the single source of truth for what every managed hook
 * must do at the real invocation boundary, for each host.
 *
 * Rows are discriminated by hook event so each event asserts against its OWN contract
 * (only PreToolUse has permission decisions; SessionStart emits additionalContext;
 * Stop/PostToolUse/UserPromptSubmit/PreCompact are fail-open / emit-empty-json). This
 * matrix is reused by:
 *   - the generated-command boundary smoke suite (P2),
 *   - the compiled-runtime parity replay (P4),
 *   - `wp hooks doctor --probe-decisions` (P5, smallest rows only).
 *
 * Host contracts (verified against vendor docs):
 *   - Claude Code: stdin is snake_case (tool_name/tool_input/hook_event_name); a deny is
 *     hookSpecificOutput.permissionDecision = "deny".
 *   - Codex: stdin adds tool_use_id/turn_id; deny is the same hookSpecificOutput shape,
 *     but permissionDecision "ask" and continue/stopReason/suppressOutput are UNSUPPORTED
 *     (Codex fails the hook run on them) — so our output must never contain them.
 */
export type HookHost = 'claude' | 'codex';
export declare const WEBPRESSO_HOOK_BINS: readonly ["wp-pretool-guard", "wp-post-tool", "wp-stop-qa", "wp-guard-switch", "wp-sessionstart-routing", "wp-precompact-snapshot"];
export type WebpressoHookBin = (typeof WEBPRESSO_HOOK_BINS)[number];
/** Output captured from running a hook bin against a row's stdin. */
export type HookRunResult = {
    readonly stdout: string;
    readonly exitCode: number | null;
};
type BaseRow = {
    readonly name: string;
    readonly hookBin: WebpressoHookBin;
    readonly host: HookHost;
    /** Host-shaped JSON payload delivered on the hook's stdin. */
    readonly stdin: string;
    /** Smallest representative rows used by the cheap `doctor --probe-decisions` path. */
    readonly probe?: boolean;
};
export type PreToolUseRow = BaseRow & {
    readonly event: 'PreToolUse';
    readonly hookBin: 'wp-pretool-guard';
    /** `allow` = no deny envelope; `deny` = a deny envelope routing to an MCP tool. */
    readonly expect: 'allow' | 'deny';
};
export type SessionStartRow = BaseRow & {
    readonly event: 'SessionStart';
    readonly hookBin: 'wp-sessionstart-routing';
};
/** Stop / PostToolUse / UserPromptSubmit / PreCompact: fail-open, must emit valid JSON. */
export type EmptyJsonRow = BaseRow & {
    readonly event: 'PostToolUse' | 'Stop' | 'UserPromptSubmit' | 'PreCompact';
};
export type ConformanceRow = PreToolUseRow | SessionStartRow | EmptyJsonRow;
export declare function bashPayload(host: HookHost, event: string, command: string): string;
export declare function eventPayload(host: HookHost, event: string): string;
/** Validate a hook run result against the row's per-event contract. Throws on failure. */
export declare function assertConformance(row: ConformanceRow, result: HookRunResult): void;
export declare const CONFORMANCE_MATRIX: readonly ConformanceRow[];
/** The smallest allow/deny rows, for the cheap `doctor --probe-decisions` path. */
export declare const PROBE_ROWS: readonly ConformanceRow[];
export {};
//# sourceMappingURL=matrix.d.ts.map