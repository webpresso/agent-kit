# PRD: promote parent roadmaps in agent-kit

## Goal
Make parent roadmaps visible and directly explorable in the `wp` CLI so `/pll` and human operators can see strategic roadmap context instead of orphaned child blueprints only.

## Requirements
1. `wp blueprint list` must no longer silently hide `type: parent-roadmap` documents.
2. The listing surface must distinguish roadmaps from normal blueprints in both text and JSON output.
3. The CLI must expose a direct roadmap-focused entrypoint for at least listing and showing roadmaps.
4. Parent roadmaps should sort ahead of ordinary blueprints in mixed listings so strategic context is visible first.
5. Existing blueprint show/list behavior for ordinary blueprints must remain intact.

## Non-goals
- Full roadmap tree rendering with child rollups.
- `wp audit roadmap-links`.
- `/pll` heuristic integration.
- Replanning or implementing the broader scaffold-audit draft.

## Implementation
1. Extend `BlueprintSummary` with `type` metadata and stop filtering parent roadmaps out of service listings.
2. Update sorting/formatting so roadmap entries are labeled and appear first.
3. Add an `wp roadmap` command with `list` and `show` surfaces reusing existing blueprint internals.
4. Add regression tests for service parsing/listing and CLI/root help behavior.

## Verification
- Focused vitest coverage for service parsing and CLI command surfaces passes.
- Manual CLI probes show roadmaps in list output and allow `wp roadmap show <slug>`.
