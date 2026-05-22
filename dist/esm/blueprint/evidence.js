/**
 * Evidence Contract (F10 — pinned in
 * `blueprints/in-progress/structured-blueprint-mcp-sqlite-first-agent-ops`).
 *
 * This module is the bedrock of the verification anti-forgery posture:
 * `wp_blueprint_task_verify` parses caller-supplied evidence through these
 * zod schemas before the markdown helper or the projection DB is touched.
 *
 * Validity rules enforced by the schemas:
 * - `kind: 'test'`        — requires `command` (non-empty) and `exit_code === 0`
 *                           when `result === 'pass'`. Any non-zero exit must be
 *                           paired with `result === 'fail'`.
 * - `kind: 'integration'` — same as `test`, plus a non-empty `target_files[]`.
 * - `kind: 'audit'`       — requires `audit_kind` (e.g. `tph-e2e`,
 *                           `blueprint-lifecycle`) and a `passed: true` flag
 *                           when `result === 'pass'`.
 * - `kind: 'manual'`      — requires `actor`, `description`, an explicit
 *                           `allow_manual: true` (anti-shortcut), and a
 *                           non-empty `log_excerpt` (≤ 4 KiB).
 *
 * Trivial payloads (`{ ok: true }`, `{}`) fail at parse time. The list schema
 * additionally rejects empty arrays so callers cannot satisfy the contract by
 * passing zero evidence items.
 *
 * Stronger attestation (cryptographic signing of evidence) is explicitly out
 * of scope — see the blueprint's "Anti-forgery posture" section.
 */
import { z } from 'zod';
const MANUAL_LOG_MAX_BYTES = 4096;
const baseFields = {
    result: z.enum(['pass', 'fail']),
    ts: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'ts must be an ISO 8601 date-time string',
    }),
    agent: z.string().min(1).optional(),
};
const commandExitCodeFields = {
    command: z.string().min(1),
    exit_code: z.number().int(),
};
const testEvidenceSchema = z
    .object({
    kind: z.literal('test'),
    ...baseFields,
    ...commandExitCodeFields,
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.result === 'pass' && value.exit_code !== 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exit_code'],
            message: 'passing test evidence requires exit_code === 0',
        });
    }
});
const integrationEvidenceSchema = z
    .object({
    kind: z.literal('integration'),
    ...baseFields,
    ...commandExitCodeFields,
    target_files: z.array(z.string().min(1)).min(1),
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.result === 'pass' && value.exit_code !== 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exit_code'],
            message: 'passing integration evidence requires exit_code === 0',
        });
    }
});
const auditEvidenceSchema = z
    .object({
    kind: z.literal('audit'),
    ...baseFields,
    audit_kind: z.string().min(1),
    passed: z.boolean(),
    command: z.string().min(1).optional(),
    exit_code: z.number().int().optional(),
})
    .strict()
    .superRefine((value, ctx) => {
    if (value.result === 'pass' && value.passed !== true) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['passed'],
            message: 'passing audit evidence requires passed: true',
        });
    }
});
const manualEvidenceSchema = z
    .object({
    kind: z.literal('manual'),
    ...baseFields,
    actor: z.string().min(1),
    description: z.string().min(1),
    // `allow_manual` is the anti-shortcut: agents must opt in explicitly so
    // manual evidence cannot be accidentally generated as a fallback when a
    // structured evidence kind is unavailable.
    allow_manual: z.literal(true),
    log_excerpt: z
        .string()
        .min(1)
        .refine((value) => Buffer.byteLength(value, 'utf8') <= MANUAL_LOG_MAX_BYTES, {
        message: `log_excerpt must be ≤ ${MANUAL_LOG_MAX_BYTES} bytes`,
    }),
})
    .strict();
export const evidenceSchema = z.discriminatedUnion('kind', [
    testEvidenceSchema,
    integrationEvidenceSchema,
    auditEvidenceSchema,
    manualEvidenceSchema,
]);
export const evidenceListSchema = z.array(evidenceSchema).min(1);
/**
 * Canonicalize an evidence item to stable JSON.
 *
 * Stability rules:
 * - Object keys are sorted alphabetically.
 * - Array order is preserved (semantic — e.g. `target_files`).
 * - No trailing whitespace.
 *
 * Used by the verification markdown helper to ensure re-applying the same
 * evidence produces byte-identical output (idempotency invariant).
 */
export function canonicalizeEvidence(evidence) {
    return JSON.stringify(sortKeys(evidence));
}
/**
 * Canonicalize a list of evidence items. Order is preserved.
 */
export function canonicalizeEvidenceList(evidence) {
    return JSON.stringify(evidence.map((item) => sortKeys(item)));
}
function sortKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        const out = {};
        for (const [k, v] of entries) {
            out[k] = sortKeys(v);
        }
        return out;
    }
    return value;
}
//# sourceMappingURL=evidence.js.map