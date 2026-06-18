/**
 * Lore commit-message trailer validator.
 *
 * Validates the presence and values of Lore trailers in a commit message.
 *
 * Trailer schema (from AGENTS.md):
 *   Constraint:     - external constraint (free text, at least one required)
 *   Rejected:       - alternative considered (free text)
 *   Confidence:     low | medium | high
 *   Scope-risk:     narrow | moderate | broad
 *   Reversibility:  clean | messy | irreversible (optional)
 *   Directive:      - forward-looking instruction (free text)
 *   Tested:         - what verification was performed
 *   Not-tested:     - known gaps
 *   Related:        - links (optional)
 *
 * Required (hard-fail in --require-lore mode):
 *   - Confidence: with a valid value
 *   - At least one of: Constraint:, Rejected:, Directive:
 *
 * Enum trailers always fail on invalid values regardless of mode.
 */
export interface LoreValidationOptions {
    requireLore?: boolean;
    loreWarn?: boolean;
}
export interface LoreValidationResult {
    valid: boolean;
    violations: string[];
    warnings: string[];
}
/**
 * Validate Lore trailers in a commit message.
 *
 * - `requireLore: true` — hard-fail on missing required trailers (exit non-zero)
 * - `loreWarn: true` — warn-only on missing trailers, always valid=true; but
 *   malformed enum values (e.g. `Confidence: yolo`) always fail regardless of mode
 * - neither flag — no-op, returns valid=true with no violations or warnings
 */
export declare function validateLoreTrailers(message: string, options: LoreValidationOptions): LoreValidationResult;
//# sourceMappingURL=commit-message-lore.d.ts.map