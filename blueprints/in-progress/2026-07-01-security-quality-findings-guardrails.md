---
type: blueprint
title: "Security and code quality findings guardrails"
owner: ozby
status: in-progress
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "0% (blueprint created before implementation)"
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - codeql
  - code-quality
  - guardrails
---

# Security and code quality findings guardrails

## Goal

Remediate the open GitHub code scanning and Code Quality findings, then add repo-local and GitHub-native merge gates so the same high-signal smells do not reach `main` again.

## Planning Summary

GitHub currently reports open CodeQL/code scanning alerts for workflow permissions, ReDoS-prone regular expressions, incomplete escaping/sanitization, and URL substring checks. GitHub Code Quality reports maintainability warnings for useless local assignments and a trivial conditional. This blueprint fixes those findings with small behavior-preserving changes, adds focused regression tests, and introduces a `wp audit guardrails` check for the recurring patterns that local CI can catch before GitHub analysis runs.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Merge enforcement | GitHub native rulesets for CodeQL and Code Quality | Officially supported and avoids brittle scraping. |
| Local prevention | Add a narrow repo audit under guardrails | Catches project-specific smells in `WP check` before PR merge. |
| AI findings | Advisory only | GitHub documents AI findings as a recent-default-branch view, not a stable blocking API. |
| Dependencies | No new runtime dependencies | Prefer existing helpers and small local utilities. |

## Tasks

#### [security] Task 1.1: Remediate current CodeQL/code scanning alerts

**Status:** todo

Fix workflow permissions, regex escaping/ReDoS patterns, URL allow-list checks, and incomplete escaping/sanitization findings with targeted tests.

**Acceptance:**

- [ ] Open CodeQL findings have code changes and regression coverage.
- [ ] `release.yml` has explicit least-privilege permissions with job-level write overrides only where needed.
- [ ] URL checks parse URLs and compare normalized host/protocol values.
- [ ] Dynamic regex construction uses existing escape helpers or avoids regex entirely.

#### [quality] Task 1.2: Remediate current Code Quality standard findings

**Status:** todo

Remove useless local assignments and the trivial conditional without changing behavior.

**Acceptance:**

- [ ] All six current standard findings are addressed.
- [ ] Existing tests cover changed behavior or compile-time checks prove no behavioral change.

#### [audit] Task 1.3: Add local security-quality regression audit

**Status:** todo

Create and register a focused `security-quality-regressions` repo audit that fails on the recurring project-specific patterns: URL allow-list substring checks, unescaped dynamic regex construction for task/blueprint IDs, markdown table escaping without the shared helper, and workflow files without explicit permissions.

**Acceptance:**

- [ ] `wp audit security-quality-regressions` exists and passes clean state.
- [ ] `wp audit guardrails` includes the new audit.
- [ ] Unit tests prove each guarded smell fails with a precise violation.

#### [governance] Task 1.4: Document GitHub ruleset changes

**Status:** todo

Add a concise runbook for enabling `Require code scanning results` and `Require code quality results` after the backlog is green.

**Acceptance:**

- [ ] Runbook names thresholds: CodeQL security `Medium or higher`; Code Quality `Warnings and higher`.
- [ ] Runbook states AI findings are advisory until GitHub exposes a stable blocking API.

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Targeted tests | affected Vitest files | All pass |
| Type safety | `pnpm run typecheck` | Zero errors |
| Lint | `pnpm run lint` | Zero errors |
| Guardrails | `./bin/wp audit guardrails` | Includes new audit and passes |
| GitHub backlog | `gh api` code scanning/code quality open findings | No open findings for remediated rules after GitHub analysis refreshes |

## Notes

Repo settings changes are intentionally documented, not applied in code. They require admin access and should be enabled only after the remediation PR is green.
