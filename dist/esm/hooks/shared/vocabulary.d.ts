/**
 * Status vocabulary for hook status reporting. Only the states that
 * `specStatus` (status/index.ts) actually produces are represented here; add a
 * term when a producer for it lands, not before.
 */
export declare const HOOK_STATUS: {
    readonly installed: "installed";
    readonly enforcing: "enforcing";
    readonly disabled: "disabled";
};
export type HookStatus = (typeof HOOK_STATUS)[keyof typeof HOOK_STATUS];
export type HookStatusDetail = {
    readonly hook: string;
    readonly event: string;
    readonly vendor: "claude" | "codex" | "cursor";
    readonly status: HookStatus;
    readonly reason?: string;
    readonly nextCommand?: string;
};
/**
 * Format a HookStatusDetail for terminal output (one line).
 *
 * Example:
 *   PreToolUse           wp-pretool-guard             claude    enforcing
 *   SessionStart         wp-sessionstart-routing      codex     disabled       → run: wp setup
 */
export declare function formatStatusLine(detail: HookStatusDetail): string;
//# sourceMappingURL=vocabulary.d.ts.map