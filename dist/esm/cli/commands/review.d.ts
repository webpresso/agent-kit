import type { CAC } from "cac";
export type ReviewVerdict = "approve" | "approve-with-nits" | "reject" | "no-verdict";
export type ReviewTargetKind = "blueprint" | "pull-request";
export declare const REVIEWER_IDS: readonly ["codex", "deepseek", "eng-review", "ceo-review", "mimo", "glm", "qwen", "kimi", "minimax", "hy3", "claude", "human"];
export type ReviewReviewerId = (typeof REVIEWER_IDS)[number];
export interface ReviewEntry {
    readonly id: string;
    readonly blueprintSlug: string;
    readonly blueprintPath: string;
    readonly targetKind: ReviewTargetKind;
    readonly targetId: string;
    readonly artifact?: string;
    readonly targetHash?: string;
    readonly timestamp: string;
    readonly reviewer: string;
    readonly verdict: ReviewVerdict;
    readonly rev?: string;
    readonly commit?: string;
    readonly evidence?: string;
    readonly note?: string;
    readonly taskType?: string;
    readonly findingsSurvived?: number;
    readonly falsePositives?: number;
    readonly latencyMs?: number;
    readonly agreementWithFinal?: boolean;
    readonly source: "legacy-table" | "structured";
}
interface ReviewCommandOptions {
    json?: boolean;
    projectRoot?: string;
    reviewer?: string;
    targetKind?: string;
    targetId?: string;
    artifact?: string;
    targetHash?: string;
    verdict?: string;
    rev?: string;
    commit?: string;
    evidence?: string;
    note?: string;
    taskType?: string;
    findingsSurvived?: string;
    falsePositives?: string;
    latencyMs?: string;
    agreementWithFinal?: string;
}
interface ReviewLedger {
    readonly blueprintSlug: string;
    readonly blueprintPath: string;
    readonly reviewsPath: string;
    readonly entries: readonly ReviewEntry[];
}
interface ReviewScoreboardRow {
    readonly reviewer: string;
    readonly taskType: string;
    readonly total: number;
    readonly approve: number;
    readonly approveWithNits: number;
    readonly reject: number;
    readonly noVerdict: number;
    readonly findingsSurvived: number;
    readonly falsePositives: number;
    readonly averageLatencyMs: number | null;
    readonly agreementWithFinalRate: number | null;
    readonly signalPrecision: number | null;
    readonly timeoutRate: number;
    readonly recommendation: string;
}
export declare function readReviewLedger(projectRoot: string, slug: string): Promise<ReviewLedger>;
export declare function logReviewEntry(projectRoot: string, slug: string, input: ReviewCommandOptions): Promise<ReviewEntry>;
export declare function buildReviewScoreboard(entries: readonly ReviewEntry[]): readonly ReviewScoreboardRow[];
export declare function registerReviewCommand(cli: CAC): void;
export {};
//# sourceMappingURL=review.d.ts.map