---
type: blueprint
status: planned
owner: agent-kit
complexity: M
created: 2026-07-01
last_updated: 2026-07-01
title: Weekly merge documentation audit
progress: "0% (0 of 4 tasks completed)"
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

**Status:** pending

Collect GitHub PR metadata for PRs merged since 2026-06-24, compare merge commits against the current remote `main`, and decide which items require durable docs updates.

**Acceptance:**

- [ ] PR inventory includes number, title, merge date, merge commit, and docs disposition.
- [ ] Non-ancestor merge commits are explicitly recorded as a branch-state anomaly.

#### [docs] Task 1.2: Update durable operator docs

**Status:** pending

Patch relevant docs under `docs/` for security audits, hooks, CI, blueprint lifecycle/format, browser/add-ons, and release/dependency gates.

**Acceptance:**

- [ ] Security/code-quality API verification commands are present.
- [ ] Hook and CI docs mention the relevant guardrails without duplicating implementation internals.
- [ ] Blueprint and add-on docs remain concise and consistent with existing terminology.

#### [docs] Task 1.3: Add weekly merge docs audit note

**Status:** pending

Create a dated audit note that maps every merged PR to updated docs, existing coverage, or no-doc-needed rationale.

**Acceptance:**

- [ ] The audit note covers each PR returned by GitHub for the window.
- [ ] Version-package, dependency-bump, and formatting-only PRs are grouped with clear no-doc-needed rationales.

#### [verify] Task 1.4: Verify and publish docs PR

**Status:** pending

Run the narrowest repo gates that prove markdown, blueprint, and branch-protection readiness, then push the docs branch and keep the draft PR current.

**Acceptance:**

- [ ] `wp format --check` or equivalent repo facade passes, or any pre-existing unrelated failure is recorded.
- [ ] Blueprint/PR coverage checks pass.
- [ ] Draft PR contains the audit summary and verification evidence.
