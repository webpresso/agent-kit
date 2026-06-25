---
type: blueprint
title: "secret orchestration docs and version-skew contract"
owner: codex
status: completed
complexity: S
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (docs and version-skew guidance slice shipped and verified)"
depends_on: []
cross_repo_depends_on: []
tags:
  - secrets
  - docs
  - version-skew
  - onboarding
  - agent-config
---

# secret orchestration docs and version-skew contract

## Summary

Shipped the consumer-facing docs rewrite for the secret orchestration rollout:
the version-skew warning now describes the repo pin as a global `wp`
version-selection contract, consumer docs now steer repos toward the global `wp`
install plus local `@webpresso/agent-config`, and a new guide documents the
operator path from repo checkout to preview URL.

This blueprint records the repo-local execution evidence for Task 1.5 of the
larger cross-repo secret-orchestration ultragoal.

## Tasks

#### [docs] Task 1.5: Rewrite version-skew and consumer setup guidance

**Status:** done

**Depends:** None

Updated the version-skew warning copy, README Quick Start, getting-started
guide, generated AGENTS template guidance, and added a new repo-to-preview
guide so consumers stop reading the repo pin as “add local agent-kit” and
instead treat it as “align the global `wp` binary”.

**Files:**

- Modify: `src/cli/auto-update/version-skew.ts`
- Modify: `src/cli/auto-update/version-skew.test.ts`
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify: `catalog/AGENTS.md.tpl`
- Create: `docs/guides/repo-to-preview-url.md`

**Acceptance:**

- [x] The warning now points at global `wp` alignment and mentions local `@webpresso/agent-config`.
- [x] Consumer docs no longer instruct adding a local `@webpresso/agent-kit` dependency as the normal path.
- [x] Quick-start guidance now includes `wp secrets doctor` / `wp preview --json`.
- [x] The repo-to-preview operator guide exists and points to global `wp`.

## Verification

- `./bin/wp test --file src/cli/auto-update/version-skew.test.ts`
- `./bin/wp lint --file README.md --file docs/getting-started.md --file docs/guides/repo-to-preview-url.md --file catalog/AGENTS.md.tpl --file src/cli/auto-update/version-skew.ts --file src/cli/auto-update/version-skew.test.ts`
- `./bin/wp typecheck`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-secret-orchestration-docs-and-version-skew-contract.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
