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
import { z } from "zod";
export declare const evidenceSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    command: z.ZodString;
    exit_code: z.ZodNumber;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"test">;
}, z.core.$strict>, z.ZodObject<{
    target_files: z.ZodArray<z.ZodString>;
    command: z.ZodString;
    exit_code: z.ZodNumber;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"integration">;
}, z.core.$strict>, z.ZodObject<{
    audit_kind: z.ZodString;
    passed: z.ZodBoolean;
    command: z.ZodOptional<z.ZodString>;
    exit_code: z.ZodOptional<z.ZodNumber>;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"audit">;
}, z.core.$strict>, z.ZodObject<{
    actor: z.ZodString;
    description: z.ZodString;
    allow_manual: z.ZodLiteral<true>;
    log_excerpt: z.ZodString;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"manual">;
}, z.core.$strict>], "kind">;
export declare const evidenceListSchema: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    command: z.ZodString;
    exit_code: z.ZodNumber;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"test">;
}, z.core.$strict>, z.ZodObject<{
    target_files: z.ZodArray<z.ZodString>;
    command: z.ZodString;
    exit_code: z.ZodNumber;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"integration">;
}, z.core.$strict>, z.ZodObject<{
    audit_kind: z.ZodString;
    passed: z.ZodBoolean;
    command: z.ZodOptional<z.ZodString>;
    exit_code: z.ZodOptional<z.ZodNumber>;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"audit">;
}, z.core.$strict>, z.ZodObject<{
    actor: z.ZodString;
    description: z.ZodString;
    allow_manual: z.ZodLiteral<true>;
    log_excerpt: z.ZodString;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
    }>;
    ts: z.ZodString;
    agent: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<"manual">;
}, z.core.$strict>], "kind">>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceKind = Evidence["kind"];
export type EvidenceList = z.infer<typeof evidenceListSchema>;
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
export declare function canonicalizeEvidence(evidence: Evidence): string;
/**
 * Canonicalize a list of evidence items. Order is preserved.
 */
export declare function canonicalizeEvidenceList(evidence: readonly Evidence[]): string;
//# sourceMappingURL=evidence.d.ts.map