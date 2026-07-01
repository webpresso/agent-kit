/**
 * Audit: Mutation Score Gate
 *
 * Pure over the JSON data — no filesystem reads.
 * Verifies:
 *   - Covered mutation score (killed / (killed+survived)) ≥ minCovered
 *   - Raw mutation score (killed / (killed+survived+noCoverage)) ≥ minRaw
 *   - Every file with ≥ minMutantsForFileGate mutants scores ≥ minFile
 */
import type { RepoAuditResult } from "#audit/repo-guardrails";
export interface MutantEntry {
    status: "Killed" | "Survived" | "NoCoverage" | "Ignored" | "Timeout" | "RuntimeError";
}
export interface MutationReportFile {
    mutants: MutantEntry[];
}
export interface MutationReport {
    files: Record<string, MutationReportFile>;
}
export interface MutationScoreOptions {
    minCovered?: number;
    minRaw?: number;
    minFile?: number;
    minMutantsForFileGate?: number;
}
export interface MutationScoreSummary {
    coveredScore: number;
    rawScore: number;
    totalKilled: number;
    totalSurvived: number;
    totalNoCoverage: number;
}
export declare function computeMutationScores(report: MutationReport): MutationScoreSummary & {
    perFile: Array<{
        path: string;
        killed: number;
        survived: number;
        noCoverage: number;
        score: number;
    }>;
};
export declare function auditMutationScore(report: MutationReport, options?: MutationScoreOptions): RepoAuditResult;
//# sourceMappingURL=audit-mutation-score.d.ts.map