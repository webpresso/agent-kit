**Verdict:** APPROVE

**Reviewer:** DeepSeek

**Target:** PR #348 at `df622d02a3c80272f29f8ca0c3ccd39d1c3696e1`

**Findings:**

- No blocking findings.

**Rationale:**

1. **Correctness / security gaps:** The new `approvalMatchesProvenanceBackedRecord()` in `audit.ts` enforces three cumulative checks beyond the existing record match: (a) `source === "structured"` — blocks hand-authored/markdown-table entries (`audit.ts:+403`); (b) `resolveReviewArtifactPath()` rejects `reviews.md` as self-referencing (`audit.ts:+374`) and requires git-tracked existence; (c) the `--artifact` flag is plumbed through `logReviewEntry` in `review.ts` but defaults to absent, so every counted approval requires explicit provenance intent. These three layers together close the PR #345 self-authored ledger gap without fuzzy heuristics.

2. **Gate alignment:** Both `validateApprovalGate()` (`audit.ts`) and `promoteBlueprintLocked()` (`mutations.ts:501`) switched from `countDistinctLogBackedApprovals` to `countDistinctProvenanceBackedApprovals`. The old function remains exported as dead code but is unused by any gate path — low risk.

3. **Test coverage:** Four new regression cases cover: bare entries without `artifact` (`audit.approval-gate.test.ts:+184`), `artifact: "reviews.md"` self-reference (`+203`), untracked artifacts (`+220`), and `source !== "structured"` (`+237`). The `mutations.test.ts` adds a matched promotion-level test ("blocks draft to planned promotion when 2 approvals only have bare ledger summaries" at `+411`). Coarse-grained brittleness risk (e.g., legitimate artifact paths failing) is low — the path resolution reuses the existing `resolveApprovalEvidencePath` infrastructure with a single additional `reviews.md` guard.

4. **Docs/templates:** `catalog/agent/rules/pre-implementation.md`, `docs/lifecycle.md`, and both `blueprint.md` templates consistently describe "provenance-backed approvals" and "separate tracked transcript/artifact." The frontmatter example in `docs/blueprint-format.md` (`+:91-92`) now documents `artifact` as the link between `reviews.md` and the tracked transcript, matching the code contract.
