/**
 * Verification block markdown helper.
 *
 * Owns three responsibilities, in order:
 *
 * 1. **Validate** caller-supplied evidence against the Evidence Contract
 *    (see `./evidence.ts`). Trivial payloads, empty lists, and any evidence
 *    item with `result === 'fail'` reject the transition without touching
 *    markdown.
 * 2. **Serialize** the canonicalized evidence into a stable markdown block
 *    rooted under a fixed canonical header (`VERIFICATION_BLOCK_HEADER`).
 *    The stable header is the anti-forgery anchor: future re-ingests can
 *    detect tampering by re-canonicalizing and comparing.
 * 3. **Edit** the blueprint `_overview.md` in-place (read → edit → write)
 *    atomically and then trigger a re-ingest of the projection DB.
 *
 * This module is consumed by `wp_blueprint_task_verify` (Task 3.2). It does
 * not register MCP tools and has no transitive MCP dependency.
 */
import { type Evidence } from './evidence.js';
/**
 * Canonical header used to anchor the verification block under a task.
 *
 * Stability of this string is part of the contract — re-ingest, audits,
 * and tamper-detection all rely on grep-able presence. Do not change
 * casing or punctuation without a migration plan.
 */
export declare const VERIFICATION_BLOCK_HEADER = "**Verification:**";
export interface VerificationSuccess {
    readonly ok: true;
    readonly markdown: string;
    readonly status: 'done';
}
export interface VerificationFailure {
    readonly ok: false;
    readonly next_action: 'verify_task';
    readonly failures: readonly string[];
}
export type VerificationResult = VerificationSuccess | VerificationFailure;
/**
 * Apply an evidence list to a blueprint markdown buffer. Pure function — does
 * not touch the filesystem.
 *
 * On success: returns the rewritten markdown with the canonical verification
 * block inserted under the target task and the task status set to `done`.
 *
 * On failure: returns `next_action: 'verify_task'` with a structured failure
 * list. Markdown is NOT modified on failure.
 */
export declare function applyVerification(markdown: string, taskId: string, evidence: readonly Evidence[]): VerificationResult;
export interface WriteVerificationOptions {
    readonly filePath: string;
    readonly taskId: string;
    readonly evidence: readonly Evidence[];
    readonly cwd: string;
    readonly reingest: (args: {
        readonly cwd: string;
    }) => Promise<void> | void;
}
/**
 * Filesystem-backed wrapper around {@link applyVerification}.
 *
 * Reads the blueprint markdown, applies the verification, writes the result
 * back, and triggers a re-ingest via the injected callback so the SQLite
 * projection reflects the new state immediately.
 *
 * On failure, neither the file nor the projection is touched.
 *
 * Idempotency: re-applying the same canonical evidence produces the same
 * bytes; the file write is a no-op semantically, and the re-ingest call
 * remains fast because the underlying ingester is hash-aware.
 */
export declare function writeVerification(options: WriteVerificationOptions): Promise<VerificationResult>;
/**
 * Serialize evidence to the canonical markdown block.
 *
 * Format:
 *
 * ```text
 * **Verification:**
 *
 * ```agent-kit-evidence-v1
 * [<canonical-json-evidence-array>]
 * ```
 * ```
 *
 * The fenced block uses a custom language tag (`agent-kit-evidence-v1`) so
 * future versions can introduce parallel formats without conflicting with
 * existing tools' fence-language detection.
 */
export declare function serializeVerificationBlock(evidence: readonly Evidence[]): string;
/**
 * Parse evidence back out of a canonical verification block.
 *
 * Returns the parsed (and zod-validated) evidence list, or `null` if the
 * block is missing, malformed, or contains evidence that no longer satisfies
 * the Evidence Contract (which would indicate tampering).
 */
export declare function parseVerificationBlock(block: string): readonly Evidence[] | null;
//# sourceMappingURL=verification.d.ts.map