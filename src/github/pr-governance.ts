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
  readonly reason:
    | "ci_not_green"
    | "not_pull_request_event"
    | "no_open_pr"
    | "already_ready"
    | "not_opted_in"
    | "ready_transition";
  readonly command?: readonly string[];
}

export function decideReviewToReadyTransition(input: ReviewToReadyInput): ReviewToReadyDecision {
  if (input.ciConclusion !== "success") {
    return {
      passed: true,
      action: "none",
      shouldExecute: false,
      reason: "ci_not_green",
      summary: `CI for ${input.headSha} is not green; leaving PR state unchanged.`,
    };
  }
  if (input.ciEvent !== "pull_request") {
    return {
      passed: true,
      action: "none",
      shouldExecute: false,
      reason: "not_pull_request_event",
      summary: `Workflow run event ${input.ciEvent} is not pull_request; nothing to do.`,
    };
  }
  if (!input.pr) {
    return {
      passed: true,
      action: "none",
      shouldExecute: false,
      reason: "no_open_pr",
      summary: `No open PR found for ${input.headSha}; nothing to do.`,
    };
  }
  if (!input.pr.isDraft) {
    return {
      passed: true,
      action: "none",
      shouldExecute: false,
      reason: "already_ready",
      summary: `PR #${input.pr.number} is already ready for review.`,
    };
  }
  if (!input.pr.labels.includes("governance:auto-ready")) {
    return {
      passed: true,
      action: "none",
      shouldExecute: false,
      reason: "not_opted_in",
      summary: `PR #${input.pr.number} is draft without the governance:auto-ready label; leaving it as draft.`,
    };
  }

  return {
    passed: true,
    action: "ready",
    shouldExecute: input.dryRun !== true,
    reason: "ready_transition",
    summary:
      input.dryRun === true
        ? `Dry-run: would mark PR #${input.pr.number} ready for review.`
        : `Mark PR #${input.pr.number} ready for review.`,
    command: ["gh", "pr", "ready", String(input.pr.number)],
  };
}
