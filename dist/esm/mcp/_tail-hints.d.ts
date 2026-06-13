/**
 * Tail-hint rate limiting for blueprint MCP tools.
 *
 * Hints are static strings shown at the end of tool responses to nudge the
 * agent toward the next logical step. Rate-limited per hint per cwd — once
 * shown, a hint is suppressed for 7 days so it doesn't flood every response.
 *
 * History is persisted to `.agent/.tail-hint-history.jsonl` in the consumer
 * repo. Each line is a JSON record: `{ hintId, cwd, ts }`.
 */
export declare const TAIL_HINTS: {
    readonly PLL_PARALLEL: "Consider /pll for parallel execution.";
    readonly VERIFY_DONE: "Run /verify to confirm done-ness before finalizing.";
    readonly PLAN_REFINE: "Run /plan-refine to harden this blueprint.";
    readonly AUDIT_FIX: "Run /verify or `wp audit --fix` before finalizing.";
};
export type TailHintId = keyof typeof TAIL_HINTS;
/**
 * Returns true when the hint should be shown (not shown in last 7 days).
 */
export declare function shouldShowHint(cwd: string, hintId: TailHintId): boolean;
/**
 * Records that the hint was shown. Appends to `.agent/.tail-hint-history.jsonl`.
 */
export declare function recordHint(cwd: string, hintId: TailHintId): void;
/**
 * Returns the hint string if it should be shown, otherwise null.
 * Also records the hint if shown.
 */
export declare function maybeHint(cwd: string, hintId: TailHintId): string | null;
//# sourceMappingURL=_tail-hints.d.ts.map