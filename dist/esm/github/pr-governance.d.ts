export interface GovernancePullRequestSnapshot {
    readonly number: number;
    readonly isDraft: boolean;
    readonly labels: readonly string[];
}
export interface ReviewToReadyInput {
    readonly ciConclusion: "success" | "failure" | "cancelled" | "skipped";
    readonly ciEvent: string;
    readonly headSha: string;
    readonly pr: GovernancePullRequestSnapshot | null;
    readonly dryRun?: boolean;
}
export interface ReviewToReadyDecision {
    readonly passed: boolean;
    readonly action: "none" | "ready";
    readonly shouldExecute: boolean;
    readonly summary: string;
    readonly reason: "ci_not_green" | "not_pull_request_event" | "no_open_pr" | "already_ready" | "not_opted_in" | "ready_transition";
    readonly command?: readonly string[];
}
export declare function decideReviewToReadyTransition(input: ReviewToReadyInput): ReviewToReadyDecision;
//# sourceMappingURL=pr-governance.d.ts.map