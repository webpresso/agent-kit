/**
 * execution-state.ts — pure evidence/artifact state composition.
 *
 * Zero I/O. Functions take plain data and return plain data.
 * Tested by execution-state.test.ts.
 */
import { uniqueStrings } from './execution-spec.js';
// ---------------------------------------------------------------------------
// Pure evidence composers
// ---------------------------------------------------------------------------
export function normalizeEvidenceArray(values) {
    return values.map((value) => value.trim()).filter((value) => value.length > 0);
}
export function normalizeCompletionEvidence(evidence) {
    return {
        artifacts: normalizeEvidenceArray(evidence.artifacts),
        logPath: evidence.logPath?.trim() || undefined,
        verifications: normalizeEvidenceArray(evidence.verifications),
    };
}
export function mergeExecutionArtifacts(current, next) {
    const normalized = normalizeCompletionEvidence(next);
    return {
        artifacts: uniqueStrings([...(current?.artifacts ?? []), ...normalized.artifacts]),
        logPath: normalized.logPath ?? current?.logPath,
        verifications: uniqueStrings([...(current?.verifications ?? []), ...normalized.verifications]),
    };
}
export function assertCompletionEvidence(evidence, executionId) {
    if (!evidence || evidence.verifications.length === 0) {
        throw new Error(`Blueprint execution ${executionId} cannot record completion without named verification output.`);
    }
    if (evidence.artifacts.length === 0 && !evidence.logPath) {
        throw new Error(`Blueprint execution ${executionId} cannot record completion without artifact or log identity.`);
    }
    return evidence;
}
//# sourceMappingURL=execution-state.js.map