---
type: blueprint
title: Worktree-discipline guard honors effective cwd (leading cd and git -C)
status: planned
complexity: S
owner: ozby
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "0% (fix in progress)"
tags:
  - hooks
  - dx
  - guard
  - reliability
approvals:
  - reviewer: codex
    verdict: approve
    rev: final
    evidence: reviews.md
  - reviewer: deepseek
    verdict: approve
    rev: final
    evidence: reviews.md
---

# Worktree-discipline guard honors effective cwd (leading cd and git -C)

## Product wedge anchor

- **Stage outcome:** Governance Piece 3 (primary-on-main) stops false-positive-blocking legitimate worktree work, so agents can commit in a bp/<slug> worktree without the WORKTREE_DISCIPLINE_SKIP bypass.
- **Consuming surface:** The pretool-guard worktree-discipline validator (src/hooks/pretool-guard/validators/worktree-discipline.ts).
- **New user-visible capability:** `cd <worktree> && git commit` (and `git -C <worktree> commit`) is allowed even when the tool's ambient cwd is the primary checkout; bare primary-checkout commits are still blocked.

## Summary

### Broken invariant

validateWorktreeDiscipline decides 'primary checkout?' from input.cwd ALONE (worktree-discipline.ts:43-44), ignoring a leading `cd <dir>` in the command and any `git -C <dir>` flag. When an agent runs `cd <worktree> && git commit`, the Bash tool's input.cwd is the harness's ambient cwd (reset to the primary checkout), so the guard blocks a legitimate worktree commit. Reproduced repeatedly this session: `cd <worktree> && git commit` -> 'git commit in a primary checkout', forcing WORKTREE_DISCIPLINE_SKIP=1.

### Owner + fix

Owner: validateWorktreeDiscipline. Resolve the EFFECTIVE cwd the git op runs in: start from input.cwd, advance it through each leading `cd <dir>` segment (resolve relative dirs + ~ against the running cwd), then apply any `git -C <dir>` override. Evaluate isPrimaryReposCheckout against that effective cwd. This keeps the guard STRONG for real primary commits (bare `git commit` with ambient primary cwd, or `cd <primary> && git commit`) while no longer false-blocking worktree commits. Pure function, no subprocess. No public contract change; sole consumer is the pretool-guard runner.

### Why not weaker

Honoring `cd` is not a bypass: the rule only forbids commits IN a primary ~/repos checkout. `cd <elsewhere> && git commit` was always meant to be allowed (the existing test already allows ambient /tmp). This fix makes the cwd detection match the command's real behavior.

### Regression proof (test-first)

New cases in worktree-discipline.test.ts that FAIL on the old input.cwd-only logic: (a) `cd <worktree> && git commit` with ambient PRIMARY -> allowed; (b) `git -C <worktree> commit` with ambient PRIMARY -> allowed; (c) `cd <primary> && git commit` with ambient /tmp -> still blocked. Existing tests stay green.

### Scope / locked

Do not change forbiddenGitOp matchers, the WORKTREE_DISCIPLINE_SKIP env bypass, or the message copy beyond the cwd it reports. Do not touch other validators.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-28T01:50:59.494Z
- verified-head: d548b89617020b278c7716eb9694704b9ccf2849
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                                       | Evidence                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| C1  | The worktree-discipline validator owns prevention of branch and commit operations in primary checkouts.                                                                     | repo:src/hooks/pretool-guard/validators/worktree-discipline.ts             |
| C2  | The regression test covers effective-cwd worktree allows, primary blocks, cumulative git -C, compound forbidden ops, fail-closed ambiguity, and non-persistent subshell cd. | repo:src/hooks/pretool-guard/validators/worktree-discipline.test.ts        |
| C3  | Final approvals are committed in the blueprint review ledger.                                                                                                               | repo:blueprints/planned/worktree-discipline-honor-effective-cwd/reviews.md |

### Material Decisions

| ID  | Decision                | Chosen option                                                                       | Rejected alternatives                | Rationale                                                                            |
| --- | ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| D1  | Effective cwd modeling  | Static parser for persistent cd or pushd plus every git -C before each forbidden op | Raw input.cwd only                   | The guard must reflect where the git op actually runs while staying dependency-free. |
| D2  | Ambiguous shell targets | Fail closed for unresolvable cd and git -C targets                                  | Allow ambiguous commands             | Ambiguity could hide a primary-checkout mutation.                                    |
| D3  | Threat model            | Document best-effort agent guard limits                                             | Claim adversarial shell completeness | The guard prevents accidental misuse and has an explicit exceptional bypass.         |

### Promotion Gates

| Gate       | Command                      | Expected outcome | Last result                      |
| ---------- | ---------------------------- | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust     | pass             | pass at 2026-06-28T01:50:59.494Z |
| lifecycle  | wp audit blueprint-lifecycle | pass             | pass at 2026-06-28T01:50:59.494Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

## Approvals (≥2 required before promotion to `planned`)

Mirror of frontmatter `approvals:` + `reviews.md` (the durable, committed records). Gate met: **2/2 distinct** (codex + deepseek) on the final rev.

- [x] Codex (`/codex`) — APPROVE-WITH-NITS (final rev; prior rejects fixed — see `reviews.md`)
- [x] Outside voice — DeepSeek (`/deepseek`) — APPROVE (final rev)

#### Task 1.1: Failing regression tests for effective-cwd resolution

**Status:** todo
**Wave:** 0

Add cases to src/hooks/pretool-guard/validators/worktree-discipline.test.ts: cd-into-worktree allowed, git -C worktree allowed, cd-into-primary-from-elsewhere blocked. Confirm they fail on current code.

**Acceptance:**

- [ ] Three new tests fail against the current input.cwd-only logic for the right reason.
- [ ] Existing tests unchanged and still green after the fix.

#### Task 1.2: Resolve effective cwd in the validator

**Status:** todo
**Wave:** 0

Add an effectiveCwd(command, baseCwd) helper that advances baseCwd through leading `cd <dir>` segments and a `git -C <dir>` override (handles quotes, ~, relative paths via node:path resolve). Use it for the isPrimaryReposCheckout check and in the reported message.

**Acceptance:**

- [ ] validateWorktreeDiscipline evaluates the effective cwd, not raw input.cwd.
- [ ] Cognitive complexity within repo limit; no any; no new deps.
- [ ] wp test --file the validator test, wp typecheck, wp lint green on the changed files.
