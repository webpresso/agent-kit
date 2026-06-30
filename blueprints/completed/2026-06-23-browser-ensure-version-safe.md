---
type: blueprint
title: "Version-safe browser ensure command"
owner: agent
status: completed
complexity: M
created: "2026-06-23"
last_updated: "2026-06-23"
completed_at: "2026-06-23"
tags:
  - browser
  - cli
  - playwright
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed blueprint preserved as a zero-task record during lifecycle hardening; no executable task blocks were authored in the original document."
---

# Version-safe browser ensure command

## Goal

Stop repeated Chromium setup loops by ensuring browser binary installation uses
Webpresso's managed Playwright runner instead of `npx`, and by giving users an
idempotent command that installs only when the selected browser is missing.

## Acceptance criteria

- [x] `wp browser doctor` stays read-only and reports an actionable
      `wp browser ensure <browser>` command when a browser binary is missing.
- [x] `wp browser install <browser>` shells through the managed Playwright
      runner resolved by `#tool-runtime`, not `npx playwright install`.
- [x] `wp browser ensure <browser>` skips already-installed browsers, installs a
      missing browser once, re-runs doctor, and fails with an actionable message
      if installation or recheck fails.
- [x] `wp browser open` preflights the selected browser and reports the same
      ensure command instead of surfacing a raw Playwright launch error.
- [x] Browser skills and docs recommend `wp browser ensure chromium` for missing
      browser binaries.

## Verification

- `./bin/wp typecheck`
- `vp exec vitest run --maxWorkers=1 --fileParallelism=false src/browser/runtime.test.ts src/cli/commands/browser.test.ts`
- `./bin/wp lint --file src/browser/runtime.ts --file src/browser/runtime.test.ts --file src/cli/commands/browser.ts --file src/cli/commands/browser.test.ts`
- `./bin/wp format --check --file src/browser/runtime.ts --file src/browser/runtime.test.ts --file src/cli/commands/browser.ts --file src/cli/commands/browser.test.ts --file docs/getting-started.md --file docs/skills-catalog.md --file skills/browse/SKILL.md --file skills/qa-only/SKILL.md --file catalog/agent/skills/browse/SKILL.md --file catalog/agent/skills/qa-only/SKILL.md --file packages/workflow-skills/skills/browse.md --file packages/workflow-skills/skills/qa-only.md --file catalog/agent/rules/workflow-skills-routing.md --file blueprints/completed/2026-06-23-browser-ensure-version-safe.md`

## Notes

Playwright browser binaries are version-coupled to the Playwright package, so the
installer must resolve through the same package/runtime source that doctor uses.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T21:50:20.000Z
- verified-head: c9c54d0d2e23385ffe26af5036db95d36e6aec80
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                            |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-23-browser-ensure-version-safe.md |

### Material Decisions

| ID  | Decision                                                                     | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | ---------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard completed-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-23T00:00:00.000Z |
| trust     | wp audit blueprint-trust     | pass             | pass at 2026-06-23T21:50:20.000Z |

### Residual Unknowns

None.
