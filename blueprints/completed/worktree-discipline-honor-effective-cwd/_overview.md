---
type: blueprint
title: Worktree-discipline guard honors effective cwd (leading cd and git -C)
status: completed
complexity: S
owner: ozby
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "100% (merged in PR #294; local verification and PR CI green)"
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

### Final outcome

Shipped in PR #294 (`b981ab6b`). The guard now evaluates the effective cwd for every forbidden git mutation in a command, not just the tool ambient cwd. It allows legitimate worktree operations through ambient worktree cwd, success-gated `cd`/`pushd`, subshell-local worktree commands, and cumulative `git -C` flags. It still blocks primary-checkout mutations, including branch-switching checkout forms, commit/switch/branch creation and copy/move/reset forms, alias/config target overrides, nested shell/eval forms, and unresolved cwd targets. Explicit file restores such as `git checkout -- file` remain allowed.

Verification completed before merge: local validator tests, typecheck, lint, and format passed; PR CI reached CLEAN. Later source sync updated generated AGENTS instructions on main at `1874b997`, so the docs now record the merged behavior.

### Broken invariant

validateWorktreeDiscipline decides 'primary checkout?' from input.cwd ALONE (worktree-discipline.ts:43-44), ignoring a leading `cd <dir>` in the command and any `git -C <dir>` flag. When an agent runs `cd <worktree> && git commit`, the Bash tool's input.cwd is the harness's ambient cwd (reset to the primary checkout), so the guard blocks a legitimate worktree commit. Reproduced repeatedly this session: `cd <worktree> && git commit` -> 'git commit in a primary checkout', forcing WORKTREE_DISCIPLINE_SKIP=1.

### Owner + fix

Owner: `validateWorktreeDiscipline`. The final fix resolves the cwd that governs each forbidden git op, then applies the primary-checkout rule to that effective cwd. The resolver starts from `input.cwd`, follows simple success-gated `cd`/`pushd` chains that directly govern the op, applies every `git -C <dir>` flag cumulatively, and checks every forbidden op in compound commands. Unsupported shell reinterpretation, target overrides, alias/config mutation forms, and unresolved cwd targets fail closed. Pure function, no subprocess, no new dependency, and no public contract change; the sole consumer is the pretool-guard runner.

### Why not weaker

Honoring simple `cd`/`git -C` is not a bypass: the rule forbids mutations in a primary `~/repos` checkout, not all commits from an agent session. The final implementation also avoids the opposite failure mode: if the command uses shell behavior the parser cannot prove safe, it blocks instead of guessing.

### Regression proof (test-first)

The initial effective-cwd tests failed on the old input.cwd-only logic: `cd <worktree> && git commit` and `git -C <worktree> commit` were false-blocked, while `cd <primary> && git commit` still needed to block. Review rounds then expanded coverage to checkout branch forms, file-restore allows, cumulative `git -C`, multi-op compound commands, semicolon/`||` ambiguity, subshell-local cwd, aliases/config/env target overrides, nested shell/eval forms, quoted/escaped git tokens, and fake `.agent/worktrees` paths inside a primary checkout.

### Scope / locked

The `WORKTREE_DISCIPLINE_SKIP=1` exceptional bypass remains. The change stays inside the worktree-discipline validator and its tests; other validators are untouched.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-28T04:59:00.000Z
- verified-head: b981ab6b0fc1d8ef7d189cc01ce91cb3af64ecab
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                                                              | Evidence                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C1  | The worktree-discipline validator owns prevention of branch and commit operations in primary checkouts.                                                                                            | repo:src/hooks/pretool-guard/validators/worktree-discipline.ts               |
| C2  | The regression test covers effective-cwd allows/blocks, checkout and branch mutation forms, cumulative git -C, compound ops, fail-closed ambiguity, target overrides, and nested shell/eval cases. | repo:src/hooks/pretool-guard/validators/worktree-discipline.test.ts          |
| C3  | Final approvals and later review rounds are committed in the blueprint review ledger.                                                                                                              | repo:blueprints/completed/worktree-discipline-honor-effective-cwd/reviews.md |

### Material Decisions

| ID  | Decision                | Chosen option                                                                       | Rejected alternatives                | Rationale                                                                            |
| --- | ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| D1  | Effective cwd modeling  | Static parser for persistent cd or pushd plus every git -C before each forbidden op | Raw input.cwd only                   | The guard must reflect where the git op actually runs while staying dependency-free. |
| D2  | Ambiguous shell targets | Fail closed for unresolvable cd and git -C targets                                  | Allow ambiguous commands             | Ambiguity could hide a primary-checkout mutation.                                    |
| D3  | Threat model            | Document best-effort agent guard limits                                             | Claim adversarial shell completeness | The guard prevents accidental misuse and has an explicit exceptional bypass.         |

### Promotion Gates

| Gate       | Command                      | Expected outcome | Last result                      |
| ---------- | ---------------------------- | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust     | pass             | pass before promotion            |
| lifecycle  | wp audit blueprint-lifecycle | pass             | pass before and after completion |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

## Approvals (≥2 required before promotion to `planned`)

Mirror of frontmatter `approvals:` + `reviews.md` (the durable, committed records). Gate met before promotion: **2/2 distinct** (codex + deepseek) on the final rev. Later post-merge reviews are retained in `reviews.md` for the full audit trail.

- [x] Codex (`/codex`) — APPROVE-WITH-NITS (final rev; prior rejects fixed — see `reviews.md`)
- [x] Outside voice — DeepSeek (`/deepseek`) — APPROVE (final rev)
- [x] Post-merge review — code-reviewer — APPROVE
- [x] Post-merge review — critic — APPROVE

#### Task 1.1: Failing regression tests for effective-cwd resolution

**Status:** done
**Wave:** 0

Added regression coverage in `src/hooks/pretool-guard/validators/worktree-discipline.test.ts` for worktree allows, primary blocks, success-gated cwd chains, cumulative `git -C`, compound forbidden ops, fail-closed ambiguity, branch checkout/branch creation variants, alias/config target overrides, nested shell/eval forms, and explicit file-restore allows.

**Acceptance:**

- [x] Three initial effective-cwd tests failed against the input.cwd-only logic for the right reason.
- [x] Expanded edge-case tests cover the later review findings.
- [x] Existing tests stayed green after the fix.

**Evidence:** PR #294; `wp test --file src/hooks/pretool-guard/validators/worktree-discipline.test.ts` passed locally and in CI.

#### Task 1.2: Resolve effective cwd in the validator

**Status:** done
**Wave:** 0

Implemented effective-cwd evaluation in `validateWorktreeDiscipline`: each forbidden git op is checked at the cwd that governs that op, using simple success-gated `cd`/`pushd` chains and cumulative `git -C`; unsupported shell reinterpretation, aliases, target overrides, and unresolved paths fail closed.

**Acceptance:**

- [x] validateWorktreeDiscipline evaluates the effective cwd, not raw input.cwd.
- [x] No new dependencies; implementation stays local to the validator.
- [x] `wp test --file`, `wp typecheck`, `wp lint`, and `wp format --check` passed on the changed files.

**Evidence:** PR #294; merge commit `b981ab6b0fc1d8ef7d189cc01ce91cb3af64ecab`; PR CI green before squash merge.
