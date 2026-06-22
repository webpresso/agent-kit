---
type: blueprint
title: Create workspace package GitHub releases
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - release
  - github
  - changesets
  - agent-config
completed_at: '2026-06-17'
---

# Create workspace package GitHub releases

## Summary

Ensure the custom release path creates discoverable GitHub Releases for public
non-root workspace packages, such as `@webpresso/agent-config`, instead of only
creating the root `@webpresso/agent-kit` runtime release.

## Acceptance

- [x] The publish handoff records every package published by `release:publish`.
- [x] Already-published changed workspace package versions stay in the handoff so release-finalization reruns can repair missing GitHub Releases.
- [x] The release workflow watches workspace package manifest/changelog version surfaces.
- [x] The release workflow creates package-specific GitHub Releases for non-root packages.
- [x] Root runtime binary release/tag/branch finalization only runs when the root package is in the publish handoff.
- [x] The already-published `@webpresso/agent-config@0.1.5` GitHub Release is backfilled.

## Verification

- `gh release view '@webpresso/agent-config@0.1.5' --repo webpresso/agent-kit --json tagName,name,url,targetCommitish`
- `./bin/wp audit ai-contracts`
- `./bin/wp lint --file ...`
- `./bin/wp typecheck`
- `pnpm exec vitest run scripts/release-publish.test.ts src/build/auth-preflight-packages.test.ts`
- `./bin/wp audit blueprint-lifecycle`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit guardrails`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-create-workspace-github-releases.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
