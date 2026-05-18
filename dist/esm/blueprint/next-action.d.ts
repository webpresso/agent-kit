/**
 * NextAction — discriminated union for MCP tool routing hints (F18).
 *
 * Six MCP blueprint tools return `next_action` to nudge agents toward the
 * follow-up call that resolves a failed read or mutation. Without a single
 * source of truth, hint strings drift between handler code and the agent
 * routing logic that consumes them.
 *
 * This module is the only source of truth for those values. New kinds must
 * extend `NEXT_ACTION_KINDS` and the matching `NextAction` union together so
 * exhaustive `switch` statements force a compile error when a case is
 * forgotten.
 *
 * Wire-shape: `{ kind, hint }`. `hint` is human-readable guidance; it must
 * be non-empty so audit trails remain grep-able.
 */
export declare const NEXT_ACTION_KINDS: readonly ["rebuild_db", "reingest_project", "disambiguate_slug", "verify_task", "create_blueprint", "configure_workspace", "unsupported_roots"];
export type NextActionKind = (typeof NEXT_ACTION_KINDS)[number];
export type NextAction = {
    readonly kind: NextActionKind;
    readonly hint: string;
};
/** Build a `NextAction` with a required non-empty hint. */
export declare function makeNextAction(kind: NextActionKind, hint: string): NextAction;
/** Type-guard for tagged-union narrowing at boundary IO (MCP, JSON, tests). */
export declare function isNextAction(value: unknown): value is NextAction;
//# sourceMappingURL=next-action.d.ts.map