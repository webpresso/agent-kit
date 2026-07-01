import type { HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
export type DispatchOptions = {
    readonly event: string;
    readonly vendor: "claude" | "codex";
    readonly repoRoot: string;
};
export type DispatchResult = {
    readonly event: string;
    readonly vendor: string;
    readonly hooks: readonly DispatchedHook[];
};
export type DispatchedHook = {
    readonly command: string;
    readonly matcher: string | undefined;
};
/**
 * Core dispatch logic — pure and testable.
 *
 * Validates the event against HOOK_EVENT_NAMES, finds registered hook
 * groups for that event in the provided HooksMap, and returns the list of
 * registered hooks. Hooks are listed, not executed; live subprocess
 * invocation is a deferred follow-up.
 */
export declare function dispatch(hooksMap: HooksMap, options: DispatchOptions): Promise<DispatchResult>;
/**
 * CLI entry point for `wp hooks dispatch <event> [--vendor <vendor>]`.
 *
 * Parses argv, reads the vendor hook config, calls dispatch(), and prints
 * the registered hooks for the event. Live subprocess invocation is deferred.
 */
export declare function dispatchCommand(argv: readonly string[]): Promise<void>;
//# sourceMappingURL=index.d.ts.map