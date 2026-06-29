import { describe, expect, it } from "vitest";

import { decideReviewToReadyTransition } from "./pr-governance.js";

describe("decideReviewToReadyTransition", () => {
  it("does nothing when CI is not green", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "failure",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: { number: 12, isDraft: true, labels: ["governance:auto-ready"] },
      }),
    ).toMatchObject({
      action: "none",
      shouldExecute: false,
      reason: "ci_not_green",
    });
  });

  it("does nothing when the workflow run was not triggered by a pull request", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "push",
        headSha: "abc123",
        pr: { number: 12, isDraft: true, labels: ["governance:auto-ready"] },
      }),
    ).toMatchObject({
      action: "none",
      shouldExecute: false,
      reason: "not_pull_request_event",
    });
  });

  it("does nothing when no open PR matches the workflow SHA", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: null,
      }),
    ).toMatchObject({
      action: "none",
      shouldExecute: false,
      reason: "no_open_pr",
    });
  });

  it("does nothing when the PR is already ready", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: { number: 12, isDraft: false, labels: ["governance:auto-ready"] },
      }),
    ).toMatchObject({
      action: "none",
      shouldExecute: false,
      reason: "already_ready",
    });
  });

  it("does nothing when the PR did not opt into auto-ready", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: { number: 12, isDraft: true, labels: ["foo"] },
      }),
    ).toMatchObject({
      action: "none",
      shouldExecute: false,
      reason: "not_opted_in",
    });
  });

  it("returns a dry-run ready transition without merging", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: { number: 12, isDraft: true, labels: ["governance:auto-ready"] },
        dryRun: true,
      }),
    ).toMatchObject({
      action: "ready",
      shouldExecute: false,
      reason: "ready_transition",
      summary: "Dry-run: would mark PR #12 ready for review.",
      command: ["gh", "pr", "ready", "12"],
    });
  });

  it("returns an executable ready transition for opted-in draft PRs on green CI", () => {
    expect(
      decideReviewToReadyTransition({
        ciConclusion: "success",
        ciEvent: "pull_request",
        headSha: "abc123",
        pr: { number: 12, isDraft: true, labels: ["governance:auto-ready"] },
      }),
    ).toMatchObject({
      action: "ready",
      shouldExecute: true,
      reason: "ready_transition",
      command: ["gh", "pr", "ready", "12"],
    });
  });
});
