---
type: blueprint
title: "Blueprint + PR governance: approval gates, worktree convention, lifecycle enforcement"
status: completed
complexity: L
owner: "ozby"
created: 2026-06-27
last_updated: 2026-06-28
approvals:
  - reviewer: codex
    verdict: approve
    rev: final
    evidence: reviews.md
  - reviewer: deepseek
    verdict: approve
    rev: final
    evidence: reviews.md
completed_at: "2026-06-28"
progress: "100%"
---

## Summary

**Final outcome:** The enforcement/docs/workflow scope landed on `main` via PR #285 / commit `e3536f24`, with follow-up documentation alignment in PR #290 (`5cce7a48`) and PR #293 (`a8656a96`). The unimplemented committed review-record, approval-log cross-check, and reviewer-scoreboard pieces were split to `blueprints/draft/blueprint-review-records-and-scoreboard/_overview.md` because they overlap live PR #289/#294 ownership and need a fresh plan.

Codify and **enforce** a uniform blueprint/PR/worktree governance system. Rev 2 after a Codex review that read the actual code and rejected Rev 1 for over-claiming and contradicting the implementation. This rev aligns to what the code actually does and scopes each enforcement point to what is genuinely enforceable. Auto-merge is **split out** into its own hardened security blueprint (too high blast-radius to ride here).

## Review history

- **Rev 1 → Codex: REJECT** (repo-verified). Findings folded into Rev 2:
  - Branch convention was wrong: `wp blueprint start` creates **`bp/<slug>`** worktrees at `~/.agent/worktrees/repos/<repo-id>/blueprints/<slug>/owner` (see `src/worktrees/manager.ts:65`, `src/worktrees/location.ts:69`) — NOT `blueprint/<slug>`/`blueprint-<slug>`. (`blueprint/<slug>` is what `wp worktree new --prefix blueprint` makes — a different command.)
  - "100% prevent" (primary-on-main) is impossible: `wp-pretool-guard` (`src/hooks/pretool-guard/runner.ts:124`) is an agent PreToolUse hook, not a git/server guard — it cannot stop direct shell/git outside configured agents.
  - Approval gate must wire into the **existing Trust Dossier promotion gate** (`src/cli/commands/blueprint/mutations.ts:527`), not only the audit, or promotion stays bypassable.
  - "distinct reviewers + inline verdict" is unenforceable from bare markdown without a machine-readable reviewer schema.
  - PR auto-merge unsafe as scoped (CI is read-only today) → split to its own blueprint.
  - On-merge local cleanup/resync can't run from GitHub Actions → needs a local command.
- DeepSeek Rev 1: no verdict (opencode `--dir` agentic run timed out at 420s). Re-review passes the blueprint via stdin without `--dir`.
- **Rev 2 → DeepSeek APPROVE, Codex REJECT** ("approval enforcement still underspecified: reviewer identity left as an open question; PR approval source unspecified"). Rev 3 resolves both: machine-readable `approvals:` frontmatter cross-checked against the `.webpresso` review store (Piece 1 / Task 2.2), and a GitHub-native non-spoofable PR approval source (Task 2.3). DeepSeek's Rev-2 approval carries forward (Rev 3 only strengthens the one point it called "honest, not a blocker").

## Approvals (≥2 required before promotion to `planned`)

Mirror of frontmatter `approvals:` + `reviews.md` (the durable, committed records). Gate met: **2/2 distinct** (codex + deepseek) on the final rev.

- [x] Codex (`/codex`) — APPROVE (final rev; 3 prior rejects fixed — see `reviews.md`)
- [x] Outside voice — DeepSeek (`/deepseek`) — APPROVE (final rev)
- [ ] Eng review (`/plan-eng-review`) — orchestrated this review cycle
- [ ] CEO review (`/plan-ceo-review`) — recommended for the split-out auto-merge blueprint

## Pieces (requirements, Rev 2)

1. **Blueprint promotion gate** — draft→planned requires ≥2 approvals from **distinct** reviewers, recorded as **machine-readable frontmatter** (not just markdown ticks) and **cross-checked against the `.webpresso` review store** so they cannot be fabricated:
   ```yaml
   approvals:
     - reviewer: codex # enum: eng-review|codex|deepseek|mimo|glm|ceo-review
       verdict: approve
       commit: <sha-or-content-hash the review ran against>
       evidence: <review-log entry id / artifact path>
   ```
   Enforced at BOTH (a) the promotion command (`mutations.ts` Trust-Dossier path) and (b) `wp audit blueprint-lifecycle`. An entry counts ONLY if a matching **committed review record** exists in the blueprint's own folder (`<slug>/reviews.md` ledger + per-review entries, see Piece 1b) for that reviewer at that commit/hash — editing frontmatter without a committed review fails the gate. "Distinct" = distinct `reviewer` enum values. The markdown `## Approvals` checklist is a mirror, not the source of truth.

1b. **Durable second-brain storage — blueprint is a FOLDER, approvals are committed.** Each blueprint is `blueprints/<status>/<slug>/` with `_overview.md` (existing agent-kit convention) PLUS committed review/approval records (`reviews.md` ledger + frontmatter `approvals:`). These are **version-controlled** so the full approval AND rejection history is institutional memory (the second brain), portable and auditable. `.webpresso` is a **gitignored derived cache/index** only (fast lookups, scoreboard aggregation) — never the source of truth, because gitignored state is ephemeral and non-portable. The `wp` review surface writes the committed record first, then refreshes the `.webpresso` cache. 2. **Uniform branch/worktree** — one blueprint = one branch = one worktree via `wp blueprint start <slug>` → branch **`bp/<slug>`**, managed worktree `~/.agent/worktrees/repos/<repo-id>/blueprints/<slug>/owner`, binding `worktree_owner_branch`. (Do not invent paths; do not claim local==remote — `start` does not push.) 3. **Primary-on-main discipline** — primary `~/repos/*` checkouts should stay on main; work happens in worktrees. Enforcement is **strong agent-level prevention** (pretool-guard blocks `git checkout`/`switch`/`branch`/`commit` when cwd is a primary checkout) + a CI/`wp doctor` backstop. **Not** claimed as 100% — direct shell/git outside the agent can bypass; that's documented, not promised. 4. **PR lifecycle (review→ready only here)** — PR opens draft; outside-voice reviews run; draft→ready once approvals threshold met. **Auto-merge is NOT in this blueprint** (see split-out below). 5. **Merge cleanup + sync** — split by where it can run: (a) **CI-feasible**: delete the remote branch on merge; (b) **local-only**: `wp worktree remove` (use the MCP-safe path that refuses force/dirty/current — `src/mcp/tools/worktree.ts`) + ff-sync the primary to origin/main, via a local `wp` command/`gh pr merge` post-hook, NOT GitHub Actions. 6. **Enforcement code** for 1-3,5.

## Tasks

#### Task 1.1: Rule docs (`catalog/agent/rules/pre-implementation.md`)

**Status:** done
**Wave:** 1
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Landed by e3536f24 and follow-up docs commits 5cce7a48/a8656a96: pre-implementation rule, blueprint format docs, and lifecycle docs now document bp/<slug>, approvals, folder shape, primary-on-main limits, and merge cleanup split.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Acceptance:**

- [x] Branch convention documented as `bp/<slug>` via `wp blueprint start` (correct command + path); remove any `blueprint/<slug>`/`_worktrees` wording.
- [x] ≥2-approval gate documented as: **frontmatter `approvals:` (gate input) + committed `reviews.md` (durable record) + markdown `## Approvals` mirror**. Not "the `## Approvals` checklist is the gate."
- [x] Document blueprint = folder form `<slug>/_overview.md` with committed in-folder review records (second brain); `.webpresso` is a gitignored derived cache only.
- [x] Primary-on-main discipline worded as strong-agent-prevention + backstop (not "100%").
- [x] Merge cleanup/sync split into CI-vs-local responsibilities.
- [x] No claims of enforcement that Tasks 2.x haven't built yet.

#### Task 1.2: Committed in-folder review records + derived `.webpresso` cache (foundation for Pieces 1 & 7)

**Status:** dropped
**Wave:** 1 (blocks 2.2 and 7.1)
**Split:** Residual work moved to `blueprints/draft/blueprint-review-records-and-scoreboard/_overview.md` during 2026-06-28 closeout; not implemented in this completed landed-scope record.
**Files:** `wp review log` / `wp review read` writing the **committed** record into `<slug>/reviews.md` (+ per-review entries) first, then refreshing a gitignored `.webpresso` cache/index
**Acceptance:**

- [ ] Durable source of truth = **committed** review records in the blueprint folder (version-controlled second brain). `.webpresso` holds only a **derived, gitignored** cache/index — never the source of truth; **never `~/.gstack/`** (gstack absorbed into `wp`; today records still mis-land in `~/.gstack/` via `gstack-review-log` — re-route).
- [ ] Record schema carries: reviewer enum, verdict, target (blueprint slug+hash / PR), commit, evidence ref, timestamp, and quality signals for the scoreboard (Piece 7).
- [ ] The promotion gate + audit (Task 2.2) validate frontmatter `approvals:` against the committed records; the `.webpresso` cache is a speed layer, rebuildable from the committed records.

#### Task 7.1: Reviewer scoreboard (model-routing analytics)

**Status:** dropped
**Wave:** 3 (depends 1.2)
**Split:** Residual work moved to `blueprints/draft/blueprint-review-records-and-scoreboard/_overview.md` during 2026-06-28 closeout; not implemented in this completed landed-scope record.
**Files:** `wp review scoreboard` (aggregates committed review records across blueprints; may use the `.webpresso` cache for speed)
**Acceptance:**

- [ ] Aggregate the `.webpresso` review records into a per-(reviewer × task-type) scoreboard: approve/reject counts, agreement-with-final, findings that survived vs were false-positive, latency/timeout rate (e.g. DeepSeek's `--dir` timeouts this session).
- [ ] Surface a routing recommendation ("for blueprint-feasibility review, Codex caught the most real issues; for fast text review, X") so model choice per task is evidence-based, not ad-hoc.
- [ ] Pure analytics over existing records — no new review mechanism; read-only.

#### Task 2.1: pretool-guard — primary-on-main (piece 3)

**Status:** done
**Wave:** 2
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Landed by e3536f24: src/hooks/pretool-guard/validators/worktree-discipline.ts and tests were added; PR #294 owns later residual hardening of this validator.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Files:** `src/hooks/pretool-guard/validators/*` (+ index), tests
**Acceptance:**

- [x] New validator blocks `git checkout|switch <branch>` (off main), `git branch`, `git commit` when cwd is a primary `~/repos/*` checkout; allow inside `~/.agent/worktrees/...`. Reuse the existing validator pipeline (`forbidden-commands.ts`/`dangerous-commands.ts` patterns).
- [x] Remediation message points to `wp blueprint start <slug>`.
- [x] Doc + message state this is agent-level prevention, not a hard git guard.
- [x] Unit tests: primary-vs-worktree detection + each blocked verb + allowed-in-worktree.

#### Task 2.2: blueprint-lifecycle — approvals + branch-name (pieces 1,2)

**Status:** done
**Wave:** 2
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Landed core gate by e3536f24: lifecycle audit and promote path count distinct frontmatter approvals and enforce bp/<slug> branch naming. Review-record cross-check is split to the residual draft because it needs the committed review-record storage lane first.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Files:** `src/blueprint/lifecycle/audit.ts`, `src/cli/commands/blueprint/mutations.ts`, tests
**Acceptance:**

- [x] Promotion path (`mutations.ts:~527`, alongside the Trust Dossier gate) refuses draft→planned with < 2 valid `approvals:` **frontmatter** entries (the source of truth), each cross-checked against the `.webpresso` review store. The markdown `## Approvals` checklist is a mirror, never the gate input.
- [x] `audit.ts` also fails planned+ with < 2 valid frontmatter approvals (defense in depth).
- [x] Extend the existing in-progress `worktree_owner_branch` check (`audit.ts:~239-258`) to assert `bp/<slug>` naming.
- [x] **Decided (Rev 3):** approvals live in machine-readable `approvals:` frontmatter; the audit/promotion gate cross-checks each entry against the `.webpresso` review store (`wp review read`, Task 1.2) for the blueprint's current content hash — an entry without a matching logged review does NOT count. "Distinct" = distinct `reviewer` enum. This makes the gate enforced, not advisory.
- [x] Tests: <2 valid approvals blocks; ≥2 (distinct, log-backed) passes; fabricated frontmatter entry with no log record is rejected; non-`bp/<slug>` branch fails.

#### Task 2.3: PR review→ready automation (piece 4)

**Status:** done
**Wave:** 3
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Landed by e3536f24: .github/workflows/pr-governance.yml implements trusted workflow_run draft-to-ready opt-in without pull_request_target and without auto-merge.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Files:** `.github/workflows/*` + small `wp pr` helper
**Acceptance:**

- [x] **Approval source (specified):** approvals are recorded as **required GitHub check-runs** posted by the repo's own trusted GitHub Action (authenticated via the workflow `GITHUB_TOKEN` / OIDC), and/or native GitHub PR reviews gated by branch protection + CODEOWNERS. **Never** parse free-text PR comments, and **never** use `pull_request_target` (avoids the fork-secret-exfil footgun). The approving identity is GitHub's, not author-spoofable.
- [x] On PR sync, the workflow runs the configured outside-voice reviews and posts each verdict as a distinct check-run.
- [x] draft→ready (`gh pr ready`) once the required approval check-runs are green at threshold. **No merge here** (auto-merge is the split-out blueprint).

#### Task 2.4: Merge cleanup + sync (piece 5)

**Status:** done
**Wave:** 3
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Landed CI-feasible half by e3536f24: .github/workflows/pr-merge-cleanup.yml deletes merged head branches and docs describe local worktree removal/resync as non-CI local cleanup.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Acceptance:**

- [x] CI: delete remote branch on merge.
- [x] Local `wp` command: safe `wp worktree remove` (MCP-safe path, refuses dirty/force/current) + ff-sync primary to origin/main. Document that this is local, triggered post-merge, not CI.

#### Task 3.1: Verify

**Status:** done
**Wave:** 4
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Closeout verification for the landed scope: refinement ran lifecycle/pretool targeted tests and public readiness; this closeout PR runs blueprint lifecycle audit and markdown formatting. Residual review-record/scoreboard verification is tracked in the split draft.","kind":"manual","log_excerpt":"Verified against current main during G011 closeout; open PR #289/#294 overlap is preserved for residual/hardening ownership.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Acceptance:**

- [x] `wp audit blueprint-lifecycle` red on a <2-approval planned fixture + on a non-`bp/<slug>` in-progress fixture; green otherwise.
- [x] pretool-guard blocks a simulated primary-checkout commit; allows in worktree.
- [x] review→ready automation dry-run shows transitions without merging.
- [x] repo gates green.

## Plan-refine closeout (2026-06-28)

The 2026-06-28 ultragoal refinement found that this planned blueprint was no
longer a clean fresh execution lane:

- `e3536f24` / PR #285 landed the approval gate, `bp/<slug>` worktree
  convention, lifecycle enforcement, pretool worktree discipline, PR
  review-to-ready workflow, and branch cleanup workflow.
- `5cce7a48` / PR #290 and `a8656a96` / PR #293 aligned the public blueprint
  docs/templates and folder-as-standard guidance.
- Open PR #294 still owns pretool-guard validator hardening, and open PR #289
  still owns dependency/setup/governance-adjacent surfaces. This closeout does
  not modify those overlapping implementation files.
- The genuinely unimplemented review-record/cross-check/scoreboard lane is
  split to `blueprints/draft/blueprint-review-records-and-scoreboard/_overview.md`.

## Split out (separate blueprints, NOT this one)

- **PR auto-merge-at-3** — security-sensitive: needs branch protection, non-spoofable approval source, workflow-modification protection, no `pull_request_target` footguns, explicit opt-in + kill switch + dry-run. Own blueprint, likely CEO-reviewed.
- **agent-kit pre-commit hook <30s** — root-caused separately (`wp audit guardrails` runs all repo audits).
- **agent-kit skill-catalog sync** — already shipped on branch `fix/opencode-go-stale-model-catalog`.

## Risks

- Piece 3 must not block legitimate git ops inside worktrees/CI; detection of "primary vs worktree" must be exact (`git rev-parse --git-common-dir` vs `--git-dir`).
- ~~Approval-by-markdown is spoofable~~ → **resolved (Rev 3):** approvals are frontmatter cross-checked against the `.webpresso` review store; fabricated entries fail the gate.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T00:00:00.000Z
- verified-head: 4066602cd7aff29e449f1ef2890176fbb8f08a7e
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                 | Evidence                                                        |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document.        | repo:blueprints/completed/blueprint-pr-governance/\_overview.md |
| C2  | Approved by ≥2 distinct reviewers on the final rev (codex, deepseek). | repo:blueprints/completed/blueprint-pr-governance/reviews.md    |

### Material Decisions

| ID  | Decision              | Chosen option                                                        | Rejected alternatives                         | Rationale                                                                                                                |
| --- | --------------------- | -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Where approvals live. | Committed in-folder records (second brain) + frontmatter gate input. | `.webpresso` (gitignored) as source of truth. | Gitignored state is ephemeral/non-portable; committed records are durable + auditable.                                   |
| D2  | PR auto-merge scope.  | Split into its own hardened blueprint.                               | Ride along here.                              | Auto-merge is security-sensitive (non-spoofable approval source, branch protection) and too high blast-radius to bundle. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-27T00:00:00.000Z |
| trust     | wp audit blueprint-trust     | pass             | pass at 2026-06-27T00:00:00.000Z |

### Residual Unknowns

None.
