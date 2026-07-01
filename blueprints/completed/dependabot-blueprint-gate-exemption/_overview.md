---
type: blueprint
title: Dependabot blueprint gate exemption
status: completed
complexity: S
owner: agent
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (audit rule, regression tests, and docs completed)"
---

# Dependabot blueprint gate exemption

## Summary

Teach the PR blueprint coverage gate to recognize Dependabot dependency-only
updates so routine package, lockfile, and GitHub Actions pin bumps do not need
fake blueprint churn, while mixed source changes still require blueprint coverage.

## Tasks

#### Task 1: Add regression coverage for Dependabot dependency-only PRs

**Status:** done
**Files:**

- `src/audit/blueprint-pr-coverage.test.ts`

**Acceptance:**

- [x] Dependabot package manifest/lockfile updates pass without a blueprint.
- [x] Dependabot GitHub Actions workflow pin updates pass without a blueprint.
- [x] Dependabot commits that also touch product source still fail without a blueprint.

#### Task 2: Implement the audit-owned exemption

**Status:** done
**Files:**

- `src/audit/blueprint-pr-coverage.ts`

**Acceptance:**

- [x] The exemption requires Dependabot `updated-dependencies` commit metadata.
- [x] The exemption is limited to dependency manifests, lockfiles, and GitHub Actions workflow files.
- [x] The existing `Blueprint-exempt:` trailer remains available for genuinely trivial manual changes.

#### Task 3: Update policy documentation

**Status:** done
**Files:**

- `AGENTS.md`
- `catalog/AGENTS.md.tpl`
- `catalog/agent/rules/pre-implementation.md`
- `docs/lifecycle.md`
- `blueprints/completed/dependabot-blueprint-gate-exemption/_overview.md`

**Acceptance:**

- [x] Agent-facing instructions describe the Dependabot dependency-only exception.
- [x] Lifecycle docs describe when non-markdown PRs may omit blueprint changes.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T00:00:00.000Z
- verified-head: 70965432eb0a7e199d9d67f1ab130457942c6051
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                  | Evidence                                                                                           |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1  | Dependabot dependency-only PRs no longer require fake blueprint churn. | repo:src/audit/blueprint-pr-coverage.test.ts; repo:src/audit/blueprint-pr-coverage.ts              |
| C2  | Mixed Dependabot/source changes still require blueprint coverage.      | repo:src/audit/blueprint-pr-coverage.test.ts                                                       |
| C3  | Agent and lifecycle docs describe the policy.                          | repo:catalog/agent/rules/pre-implementation.md; repo:docs/lifecycle.md; repo:catalog/AGENTS.md.tpl |

### Material Decisions

| ID  | Decision             | Chosen option                                               | Rejected alternatives                          | Rationale                                                                |
| --- | -------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| D1  | Exemption owner      | Encode the exception in `wp audit blueprint-pr-coverage`.   | Add per-PR `Blueprint-exempt:` commits.        | The recurring Dependabot pattern belongs in the reusable gate.           |
| D2  | Dependabot detection | Require `updated-dependencies` metadata and path allowlist. | Exempt all `package.json` or workflow changes. | Keeps manual dependency and workflow edits auditable through blueprints. |

### Promotion Gates

| Gate      | Command                                                | Expected outcome | Last result |
| --------- | ------------------------------------------------------ | ---------------- | ----------- |
| unit      | wp test --file src/audit/blueprint-pr-coverage.test.ts | pass             | pass        |
| audit     | wp audit blueprint-pr-coverage --base origin/main      | pass             | pass        |
| sync      | wp sync --check                                        | pass             | pass        |
| format    | wp format --check                                      | pass             | pass        |
| lint      | wp lint                                                | pass             | pass        |
| typecheck | wp typecheck                                           | pass             | pass        |
| lifecycle | wp audit blueprint-lifecycle                           | pass             | pass        |

### Residual Unknowns

None.
