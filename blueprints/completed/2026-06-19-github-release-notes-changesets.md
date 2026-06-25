---
type: blueprint
title: GitHub Release notes include Changesets version entries
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: S
owner: agent-kit
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100%"
tags:
  - release
  - changesets
  - github
---

# GitHub Release notes include Changesets version entries

## Summary

GitHub Releases were created with static npm/install text, so the public release
page omitted the version-specific Changesets changelog entry. Add a small release
notes helper that reads the matching package changelog section and wire the
release workflow to use it for root and workspace package releases.

## Acceptance

- [x] Root `@webpresso/agent-kit` GitHub Release notes include the matching
      `CHANGELOG.md` section for the published version.
- [x] Workspace package GitHub Release notes include the matching package
      changelog section.
- [x] Existing releases are edited with refreshed notes, not only newly created
      releases.
- [x] Root runtime release notes retain native binary context.

## Verification

- `./bin/wp test --file scripts/github-release-notes.test.ts --file src/build/auth-preflight-packages.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-github-release-notes-changesets.md |

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
