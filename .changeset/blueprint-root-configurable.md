---
"@webpresso/agent-kit": patch
---

`blueprint-root`: make blueprint directory configurable and consistent across all commands.

`BlueprintCreationService` hardcoded `webpresso/blueprints` while `resolveBlueprintRoot`
(used by list, lifecycle moves, audit, execution) was context-aware, causing creation and
reads to point at different directories in non-webpresso consumer repos.

- Add `blueprintsDir?: string` to `.agent-kitrc.json` / `AgentkitConfig` as the
  highest-priority override — bypasses all directory detection.
- `resolveBlueprintRoot` now reads `.agent-kitrc.json#blueprintsDir` first.
- All blueprint commands (`new`, `list`, `audit`, `start`, `finalize`, `move`,
  execution progress sync) now route through `resolveBlueprintRoot`.
- `ak setup` blueprint scaffolding respects the same resolution.
- Pretool hook validators (`isBlueprintPath`, `isCanonicalBlueprintOverviewPath`,
  `getBlueprintPathViolation`, `getNonCanonicalPlanningPathViolation`) accept both
  `blueprints/` and `webpresso/blueprints/` as canonical by default; accept an explicit
  `blueprintsRoot` parameter for strict per-repo enforcement.
