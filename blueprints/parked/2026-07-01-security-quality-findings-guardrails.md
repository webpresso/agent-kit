---
type: blueprint
title: "Security and code quality findings guardrails"
owner: ozby
status: parked
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implementation complete; ruleset activation remains documented repo-settings step)"
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

| Decision          | Choice                                             | Rationale                                                                                |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Merge enforcement | GitHub native rulesets for CodeQL and Code Quality | Officially supported and avoids brittle scraping.                                        |
| Local prevention  | Add a narrow repo audit under guardrails           | Catches project-specific smells in `WP check` before PR merge.                           |
| AI findings       | Advisory only                                      | GitHub documents AI findings as a recent-default-branch view, not a stable blocking API. |
| Dependencies      | No new runtime dependencies                        | Prefer existing helpers and small local utilities.                                       |

## Tasks

#### [security] Task 1.1: Remediate current CodeQL/code scanning alerts

**Status:** done

Fix workflow permissions, regex escaping/ReDoS patterns, URL allow-list checks, and incomplete escaping/sanitization findings with targeted tests.

**Acceptance:**

- [x] Open CodeQL findings have code changes and regression coverage.
- [x] `release.yml` has explicit least-privilege permissions with job-level write overrides only where needed.
- [x] URL checks parse URLs and compare normalized host/protocol values.
- [x] Dynamic regex construction uses existing escape helpers or avoids regex entirely.

#### [quality] Task 1.2: Remediate current Code Quality standard findings

**Status:** done

Remove useless local assignments and the trivial conditional without changing behavior.

**Acceptance:**

- [x] All six current standard findings are addressed.
- [x] Existing tests cover changed behavior or compile-time checks prove no behavioral change.

#### [audit] Task 1.3: Add local security-quality regression audit

**Status:** done

Create and register a focused `security-quality-regressions` repo audit that fails on the recurring project-specific patterns: URL allow-list substring checks, unescaped dynamic regex construction for task/blueprint IDs, markdown table escaping without the shared helper, and workflow files without explicit permissions.

**Acceptance:**

- [x] `wp audit security-quality-regressions` exists and passes clean state.
- [x] `wp audit guardrails` includes the new audit.
- [x] Unit tests prove each guarded smell fails with a precise violation.

#### [governance] Task 1.4: Document GitHub ruleset changes

**Status:** done

Add a concise runbook for enabling `Require code scanning results` and `Require code quality results` after the backlog is green.

**Acceptance:**

- [x] Runbook names thresholds: CodeQL security `Medium or higher`; Code Quality `Warnings and higher`.
- [x] Runbook states AI findings are advisory until GitHub exposes a stable blocking API.

## Verification Gates

| Gate           | Command                                           | Success Criteria                                                      |
| -------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Targeted tests | affected Vitest files                             | All pass                                                              |
| Type safety    | `pnpm run typecheck`                              | Zero errors                                                           |
| Lint           | `pnpm run lint`                                   | Zero errors                                                           |
| Guardrails     | `./bin/wp audit guardrails`                       | Includes new audit and passes                                         |
| GitHub backlog | `gh api` code scanning/code quality open findings | No open findings for remediated rules after GitHub analysis refreshes |

## Notes

Repo settings changes are intentionally documented, not applied in code. They require admin access and should be enabled only after the remediation PR is green.

## Trust Dossier

Draft note: implementation PR #333 owns this remediation blueprint; complete a strict promotion dossier before promoting this plan to planned/in-progress lifecycle.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: v1

### Material Claims

| ID  | Claim | Evidence |
| --- | ----- | -------- |

### Material Decisions

| ID  | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | -------- | ------------- | --------------------- | --------- |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |

### Residual Unknowns

Complete before planned promotion.
