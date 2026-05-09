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
const CONFIDENCE_VALUES = ['low', 'medium', 'high'];
const SCOPE_RISK_VALUES = ['narrow', 'moderate', 'broad'];
const REVERSIBILITY_VALUES = ['clean', 'messy', 'irreversible'];
/**
 * Extract trailers from a commit message using a regex fallback.
 * Supports both "git interpret-trailers" format and manual detection.
 *
 * Trailers are `Key: value` lines at the end of the commit message,
 * separated from the body by a blank line.
 */
function extractTrailers(message) {
    const trailers = new Map();
    // Split into lines and scan for trailer-like patterns (Key: value)
    // A trailer key: starts with a capital letter or known multi-word key,
    // followed by ': ', followed by content.
    const TRAILER_PATTERN = /^([A-Za-z][A-Za-z0-9-]*): (.+)$/;
    for (const line of message.split(/\r?\n/)) {
        const match = TRAILER_PATTERN.exec(line.trim());
        if (match?.[1] && match[2] !== undefined) {
            const key = match[1];
            const value = match[2].trim();
            const existing = trailers.get(key) ?? [];
            existing.push(value);
            trailers.set(key, existing);
        }
    }
    return trailers;
}
/**
 * Validate Lore trailers in a commit message.
 *
 * - `requireLore: true` — hard-fail on missing required trailers (exit non-zero)
 * - `loreWarn: true` — warn-only on missing trailers, always valid=true; but
 *   malformed enum values (e.g. `Confidence: yolo`) always fail regardless of mode
 * - neither flag — no-op, returns valid=true with no violations or warnings
 */
export function validateLoreTrailers(message, options) {
    const { requireLore = false, loreWarn = false } = options;
    // If neither flag is set, Lore validation is off
    if (!requireLore && !loreWarn) {
        return { valid: true, violations: [], warnings: [] };
    }
    const trailers = extractTrailers(message);
    const violations = [];
    const warnings = [];
    // --- Enum value validation (always hard-fail regardless of mode) ---
    const confidenceValues = trailers.get('Confidence') ?? [];
    for (const val of confidenceValues) {
        if (!CONFIDENCE_VALUES.includes(val)) {
            violations.push(`Confidence: '${val}' is not valid. Must be one of: ${CONFIDENCE_VALUES.join(', ')}`);
        }
    }
    const scopeRiskValues = trailers.get('Scope-risk') ?? [];
    for (const val of scopeRiskValues) {
        if (!SCOPE_RISK_VALUES.includes(val)) {
            violations.push(`Scope-risk: '${val}' is not valid. Must be one of: ${SCOPE_RISK_VALUES.join(', ')}`);
        }
    }
    const reversibilityValues = trailers.get('Reversibility') ?? [];
    for (const val of reversibilityValues) {
        if (!REVERSIBILITY_VALUES.includes(val)) {
            violations.push(`Reversibility: '${val}' is not valid. Must be one of: ${REVERSIBILITY_VALUES.join(', ')}`);
        }
    }
    // --- Required trailer presence checks ---
    // Missing trailers: hard-fail in requireLore mode, warnings in loreWarn mode.
    const hasConfidence = confidenceValues.length > 0;
    const hasConstraintOrRejectedOrDirective = trailers.has('Constraint') || trailers.has('Rejected') || trailers.has('Directive');
    if (!hasConfidence) {
        const msg = 'Lore commits must include a Confidence: trailer (low|medium|high)';
        if (requireLore) {
            violations.push(msg);
        }
        else {
            warnings.push(msg);
        }
    }
    if (!hasConstraintOrRejectedOrDirective) {
        const msg = 'Lore commits must include at least one of: Constraint:, Rejected:, Directive: trailer';
        if (requireLore) {
            violations.push(msg);
        }
        else {
            warnings.push(msg);
        }
    }
    // In loreWarn mode, only enum validation errors make it invalid
    const isValid = loreWarn ? violations.length === 0 : violations.length === 0;
    return { valid: isValid, violations, warnings };
}
//# sourceMappingURL=commit-message-lore.js.map