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
export const NEXT_ACTION_KINDS = [
    "rebuild_db",
    "reingest_project",
    "disambiguate_slug",
    "verify_task",
    "create_blueprint",
    "configure_workspace",
    "unsupported_roots",
];
Object.freeze(NEXT_ACTION_KINDS);
/** Build a `NextAction` with a required non-empty hint. */
export function makeNextAction(kind, hint) {
    if (hint.trim().length === 0) {
        throw new Error("NextAction hint must be a non-empty string");
    }
    return { kind, hint };
}
/** Type-guard for tagged-union narrowing at boundary IO (MCP, JSON, tests). */
export function isNextAction(value) {
    if (value === null || typeof value !== "object")
        return false;
    const obj = value;
    if (typeof obj.kind !== "string")
        return false;
    if (typeof obj.hint !== "string")
        return false;
    return NEXT_ACTION_KINDS.includes(obj.kind);
}
//# sourceMappingURL=next-action.js.map