---
"@webpresso/agent-kit": minor
---

Make `blueprint-lifecycle` audit deterministic and fix the related lifecycle gaps.

- **Ephemeral, deterministic audit.** `wp audit blueprint-lifecycle` now builds an
  in-memory SQLite projection from the blueprint markdown on every run instead of
  reading a persistent per-worktree DB. The verdict is a pure function of the
  markdown at HEAD — no `unable to open database file`, no silent fallback, and
  identical results across the CLI, the `wp_audit` MCP tool, `wp doctor`, and CI.
- **Unified audit surface.** The CLI, MCP, and `wp doctor` now run the one audit
  (previously MCP/doctor ran a weaker markdown-only check); the duplicate
  `blueprint-lifecycle-sql` audit kind was removed.
- **Honest progress.** `progress_pct` is now computed from the task roll-up at
  ingest (previously always `null`), so the "completed but <100%" check is live.
- **New lifecycle checks:** all-tasks-done-but-still-in-progress (terminal =
  done ∪ dropped), completed-with-non-terminal-tasks, and an in-progress WIP
  limit (default 3).
- **Closed the `wp_blueprint_transition` → completed bypass** so transitioning to
  `completed` enforces the same open-task gate as finalize/promote.
- **Removed** the legacy `.agent/.blueprints.db` migration (`legacy-migration.ts`).
- **Renamed** the omx-plan handoff governance away from the misleading "legacy"
  label: `--legacy-omx` → `--omx-plans` (and `auditLegacyOmxPlans` →
  `auditOmxPlanHandoffs`). Consumers passing `--legacy-omx` must update to
  `--omx-plans`.
