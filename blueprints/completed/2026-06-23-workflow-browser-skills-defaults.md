---
type: blueprint
title: Workflow and browser skills as Webpresso defaults
status: completed
complexity: L
owner: agent
created: "2026-06-23"
last_updated: "2026-06-23"
completed_at: "2026-06-23"
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
- `vp exec vitest run --maxWorkers=1 --fileParallelism=false src/browser/runtime.test.ts src/cli/commands/browser.test.ts src/cli/commands/package-manager.test.ts src/cli/commands/hooks-upgrade/index.test.ts src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/host-visibility.test.ts scripts/audit-workflow-skills-coverage.test.ts scripts/stage-workflow-skills.test.ts`
- `vp exec vitest run --maxWorkers=1 --fileParallelism=false src/cli/commands/init/init.presets.integration.test.ts -t "returns SUCCESS and invokes rtk --version then rtk init -g --auto-patch|--dry-run does not invoke rtk at all|keeps external integrations opt-in while still probing bun/vp/actionlint without --with flags|accepts CLI-normalized dryRun and skips external setup work|whitespace around comma-separated presets is tolerated"`
- `vp exec vitest run --maxWorkers=1 --fileParallelism=false src/cli/commands/init/init.integration.test.ts -t "installs opt-in skills when --with is passed|projects skills per host: OpenCode dir, plugins for Claude/Codex|disables and restores managed hooks through the manifest|keeps previously disabled vendors disabled on a normal follow-up setup run|restore-hooks rebuilds the current direct-hook contract instead of replaying stale wrapper commands|refreshes generated .agent content by default on rerun|keeps fresh-only .agent files conservative on rerun"`
- `cd packages/workflow-skills && vp exec vitest run --config vitest.config.ts`
- `vp exec vitest run --maxWorkers=1 --fileParallelism=false package.contract.integration.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T21:41:02.000Z
- verified-head: 235178c2b985b34de78248d31f3ceb5bdfc8dd51
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                 |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-23-workflow-browser-skills-defaults.md |

### Material Decisions

| ID  | Decision                                                                     | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | ---------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard completed-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-23T00:00:00.000Z |
| trust     | wp audit blueprint-trust     | pass             | pass at 2026-06-23T21:41:02.000Z |

### Residual Unknowns

None.
