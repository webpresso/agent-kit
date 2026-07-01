---
type: blueprint
status: completed
owner: agent-kit
complexity: M
created: 2026-07-01
last_updated: 2026-07-01
title: Weekly merge documentation audit
progress: "100% (4 of 4 tasks completed)"
---

# Weekly merge documentation audit

## Intent

Refresh the durable documentation surfaces for the work reported merged during the week ending 2026-07-01, including the security/code-quality remediation and any adjacent CI, hook, blueprint, release, browser, and optional-tool behavior changes that operators or contributors need to know.

## Scope notes

- Target branch starts from the current remote `origin/main` tip.
- GitHub PR metadata reports additional merged PRs whose merge commits are not ancestors of the current remote `main`; this audit records that discrepancy instead of silently documenting target-branch behavior as if those commits are present.
- Documentation updates should remain operator-facing and concise; exhaustive per-PR evidence belongs in the weekly audit note.

## Acceptance Criteria

- Every PR reported by GitHub as merged since 2026-06-24 is mapped to either a durable docs update, an existing docs surface, or a documented no-doc-needed rationale.
- Security/code-quality docs include the official GitHub Code Quality REST API endpoint and the `gh api` commands needed to verify open Code Quality findings, code scanning alerts, secret scanning alerts, and Dependabot alerts.
- Hook, CI, blueprint, release, browser, and optional-tool docs reflect the user-visible behavior merged during the audit window where applicable.
- Verification includes the repo formatting/docs checks available for markdown-only changes plus blueprint/PR coverage evidence.

## Tasks

#### [audit] Task 1.1: Inventory merged PRs and target-branch ancestry

**Status:** done

Collect GitHub PR metadata for PRs merged since 2026-06-24, compare merge commits against the current remote `main`, and decide which items require durable docs updates.

**Acceptance:**

- [x] PR inventory includes number, title, merge date, merge commit, and docs disposition.
- [x] Non-ancestor merge commits are explicitly recorded as a branch-state anomaly.

#### [docs] Task 1.2: Update durable operator docs

**Status:** done

Patch relevant docs under `docs/` for security audits, hooks, CI, blueprint lifecycle/format, browser/add-ons, and release/dependency gates.

**Acceptance:**

- [x] Security/code-quality API verification commands are present.
- [x] Hook and CI docs mention the relevant guardrails without duplicating implementation internals.
- [x] Blueprint and add-on docs remain concise and consistent with existing terminology.

#### [docs] Task 1.3: Add weekly merge docs audit note

**Status:** done

Create a dated audit note that maps every merged PR to updated docs, existing coverage, or no-doc-needed rationale.

**Acceptance:**

- [x] The audit note covers each PR returned by GitHub for the window.
- [x] Version-package, dependency-bump, and formatting-only PRs are grouped with clear no-doc-needed rationales.

#### [verify] Task 1.4: Verify and publish docs PR

**Status:** done

Run the narrowest repo gates that prove markdown, blueprint, and branch-protection readiness, then push the docs branch and keep the draft PR current.

**Acceptance:**

- [x] `wp format --check` or equivalent repo facade passes, or any pre-existing unrelated failure is recorded.
- [x] Blueprint/PR coverage checks pass.
- [x] Draft PR contains the audit summary and verification evidence.

## Completion Evidence

- PR inventory: `gh pr list --state merged --base main --search 'merged:>=2026-06-24' --limit 120 --json number,title,mergedAt,mergeCommit,author,url` captured every PR listed in the weekly audit table.
- Ancestry check: `git merge-base --is-ancestor <merge-sha> origin/main` recorded target ancestry for each listed PR.
- Docs frontmatter: `./bin/wp audit docs-frontmatter` → passed.
- Security-quality local guard: `./bin/wp audit security-quality-regressions` → passed.
- Blueprint PR coverage: `./bin/wp audit blueprint-pr-coverage` → passed.
- Format: `./bin/wp format --check` → passed after applying formatter-required drift fixes.
- Sync check: `./bin/wp sync --check` → not applicable in the fresh source worktree because source surfaces are not materialized and this PR does not change templates/catalog.
- Targeted regression: `vp exec vitest run packages/agent-config/src/playwright/quality-scaffold.test.ts` → 1 file passed, 2 tests passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:42:41Z
- verified-head: 6dc2d7b2eb03091fbe9c8c21affdd3948e6d0d3f
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                         | Evidence                                                                                                 |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | Every PR reported merged since 2026-06-24 is dispositioned.   | repo:docs/release/2026-07-01-weekly-merge-doc-audit.md                                                   |
| C2  | Security/code-quality verification now documents REST checks. | repo:docs/security-audits.md; web:https://docs.github.com/en/rest/code-quality/code-quality (2026-07-01) |
| C3  | Future merges are documented around the aggregate WP gate.    | repo:docs/github-action.md; repo:.github/workflows/ci.agent-kit.yml                                      |
| C4  | Hook and blueprint governance docs cover weekly behavior.     | repo:docs/hooks-doctor.md; repo:docs/blueprint-format.md; repo:docs/lifecycle.md                         |

### Material Decisions

| ID  | Decision                   | Chosen option                                                  | Rejected alternatives                                  | Rationale                                                                 |
| --- | -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| D1  | Weekly PR coverage shape   | Dated audit note plus concise durable-doc updates.             | Put every PR detail into primary runbooks.             | Keeps operator docs readable while preserving complete coverage evidence. |
| D2  | Format drift handling      | Apply repo formatter-required changes in the same PR.          | Leave WP format failing as an unrelated known issue.   | PR branch protection requires `WP check`; failing format would block.     |
| D3  | Code Quality evidence path | Use official REST endpoints plus GitHub rulesets and WP check. | Treat UI-only AI findings as the only evidence source. | REST output is scriptable and auditable via `gh api`.                     |

### Promotion Gates

| Gate                         | Command                               | Expected outcome | Last result |
| ---------------------------- | ------------------------------------- | ---------------- | ----------- |
| docs-frontmatter             | wp audit docs-frontmatter             | pass             | pass        |
| security-quality-regressions | wp audit security-quality-regressions | pass             | pass        |
| blueprint-pr-coverage        | wp audit blueprint-pr-coverage        | pass             | pass        |
| format                       | wp format --check                     | pass             | pass        |
| guardrails                   | wp audit guardrails                   | pass             | pass        |

### Residual Unknowns

None.
