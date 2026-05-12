/**
 * execution-state.ts — pure evidence/artifact state composition.
 *
 * Zero I/O. Functions take plain data and return plain data.
 * Tested by execution-state.test.ts.
 */
import type { BlueprintExecutionArtifacts } from '#index';
export interface BlueprintExecutionCompletionEvidence {
    artifacts: string[];
    logPath?: string;
    verifications: string[];
}
export declare function normalizeEvidenceArray(values: string[]): string[];
export declare function normalizeCompletionEvidence(evidence: BlueprintExecutionCompletionEvidence): BlueprintExecutionArtifacts;
export declare function mergeExecutionArtifacts(current: BlueprintExecutionArtifacts | null, next: BlueprintExecutionCompletionEvidence): BlueprintExecutionArtifacts;
export declare function assertCompletionEvidence(evidence: BlueprintExecutionArtifacts | null, executionId: string): BlueprintExecutionArtifacts;
//# sourceMappingURL=execution-state.d.ts.map