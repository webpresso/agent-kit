---
type: blueprint
status: completed
owner: agent-kit
complexity: S
created: 2026-07-01
last_updated: 2026-07-01
title: PR description model disclosure gate
progress: "100% (3 of 3 tasks completed)"
---

# PR description model disclosure gate

## Intent

Require pull request descriptions to disclose the model names used for execution, planning/refinement, and review/verification so reviewers can see which AI systems contributed to each phase.

## Scope notes

- Enforce through the required aggregate `WP check` rather than a non-blocking convention.
- Keep generated release and dependency automation from being blocked by human/agent disclosure fields.
- Do not add a new dependency; use GitHub event JSON and shell tools already available on hosted runners.

## Acceptance Criteria

- `.github/PULL_REQUEST_TEMPLATE.md` includes model disclosure fields for execution, planning/refinement, and review/verification.
- Pull request CI fails when non-automation PR bodies omit the fields or leave placeholders.
- `WP check` depends on the PR description contract, so branch protection blocks missing disclosure.
- Regression tests lock the workflow/template contract.

## Tasks

#### [template] Task 1.1: Add PR description fields

**Status:** done

Add a GitHub PR template with an AI/model disclosure section.

**Acceptance:**

- [x] Execution model(s) field present.
- [x] Planning/refinement model(s) field present.
- [x] Review/verification model(s) field present.

#### [ci] Task 1.2: Enforce disclosure in WP check

**Status:** done

Add a pull-request CI job that reads `GITHUB_EVENT_PATH`, validates the PR body, and fails on missing or placeholder model disclosure.

**Acceptance:**

- [x] Job skips known automation branches that cannot reasonably fill the template.
- [x] Job is included in `WP check` dependencies.
- [x] Missing fields emit actionable GitHub error annotations.

#### [verify] Task 1.3: Lock with tests and docs

**Status:** done

Document the contributor-facing contract and add a regression test for the workflow/template wiring.

**Acceptance:**

- [x] `docs/github-action.md` describes the contract.
- [x] A build test asserts the job and fields remain present.

## Completion Evidence

- Added `.github/PULL_REQUEST_TEMPLATE.md` with AI/model disclosure fields.
- Added `pr-description-contract` to `.github/workflows/ci.agent-kit.yml` and to the `WP check` dependency list.
- Added `src/build/ci-workflow-pr-description-contract.test.ts` to lock the workflow/template contract.
- Updated `docs/github-action.md` with the branch-protection behavior.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T13:45:00Z
- verified-head: afd3bd1f698b72387240e622a69b762888297ffb
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                               | Evidence                                                   |
| --- | --------------------------------------------------- | ---------------------------------------------------------- |
| C1  | PR descriptions now have model disclosure fields.   | repo:.github/PULL_REQUEST_TEMPLATE.md                      |
| C2  | Missing disclosure blocks the aggregate PR gate.    | repo:.github/workflows/ci.agent-kit.yml                    |
| C3  | The contract is documented for contributors.        | repo:docs/github-action.md                                 |
| C4  | Regression tests lock the workflow/template wiring. | repo:src/build/ci-workflow-pr-description-contract.test.ts |

### Material Decisions

| ID  | Decision             | Chosen option                              | Rejected alternatives                   | Rationale                                      |
| --- | -------------------- | ------------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| D1  | Enforcement surface  | Dedicated CI job under required WP check.  | Template-only convention.               | Required branch check blocks missing metadata. |
| D2  | Automation handling  | Skip changeset/dependabot branch patterns. | Require bot-generated PRs to fill it.   | Avoids blocking package/dependency automation. |
| D3  | Implementation shape | Shell validation over event JSON.          | New package dependency or service call. | Small, deterministic, and runner-local.        |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-07-01T13:45:00.000Z |

### Residual Unknowns

None.
