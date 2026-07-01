import type { RepoAuditResult } from "#audit/repo-guardrails";
import { type EvidenceGapRecord } from "./evidence-gap.js";
import { type ReadPretoolEvidenceOptions } from "./read-pretool-log.js";
export interface WeaknessMiningFinding {
    id: string;
    kind: "repeated-block" | "repeated-error";
    severity: "medium" | "high";
    surfaceId: string;
    tool: string;
    target: string;
    occurrences: number;
    files: string[];
    message: string;
}
export interface WeaknessMiningReport {
    ok: boolean;
    checked: number;
    findings: WeaknessMiningFinding[];
    evidenceGap: EvidenceGapRecord | null;
    warnings: string[];
}
export interface WeaknessMiningOptions extends ReadPretoolEvidenceOptions {
    draftTechDebt?: boolean;
}
export declare function auditWeaknessMining(rootDirectory?: string, options?: WeaknessMiningOptions): Promise<RepoAuditResult>;
export declare function mineWeaknesses(rootDirectory?: string, options?: WeaknessMiningOptions): WeaknessMiningReport;
//# sourceMappingURL=index.d.ts.map