---
type: blueprint
title: Workflow and browser skills as Webpresso defaults
status: completed
complexity: L
owner: agent
created: '2026-06-23'
last_updated: '2026-06-23'
completed_at: '2026-06-23'
tags:
  - setup
  - skills
  - browser
---

# Workflow and browser skills as Webpresso defaults

## Outcome

Absorb the curated workflow skills into Webpresso's default skill projection,
add a Playwright-backed browser runtime/doctor, and retire the old active
external workflow checkout identity from setup, hooks, and update paths.

## Acceptance criteria

- [x] Fresh `wp setup` default skill projection includes workflow skills:
      `claude`, `review`, `autoplan`, `investigate`, `health`, and plan-review
      skills.
- [x] Fresh `wp setup` default skill projection includes browser/DX/QA skills:
      `browse`, `qa-only`, `qa`, `devex-review`, and `design-review`.
- [x] Browser runtime uses Playwright with `wp browser doctor`,
      `wp browser install`, and a lightweight `wp browser open` smoke helper.
- [x] Setup presets, hook scaffolders, update/ownership code, and active docs no
      longer reference or install a retired external workflow checkout.
- [x] Public notices keep only minimal MIT provenance for adapted skill assets.
- [x] Active source/templates pass the retired-identity string audit.

## Verification

- `vp run typecheck`
- `./bin/wp audit legacy-workflow-identity`
- Focused workflow/browser/setup/update/hook tests documented in the final task
  report.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T00:00:00.000Z
- verified-head: 92666c2105276e899ee15818212cfab45ed19141
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-23-workflow-browser-skills-defaults.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard completed-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-23T00:00:00.000Z |
| trust | wp audit blueprint-trust | pass | pass at 2026-06-23T00:00:00.000Z |

### Residual Unknowns

None.
