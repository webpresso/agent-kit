---
description: Manage blueprints via focused MCP tools
---
Use the focused blueprint MCP tools.

- `wp_blueprint_projects` — discover visible projects and worktrees
- `wp_blueprint_list` — list blueprints
- `wp_blueprint_get` — fetch one blueprint with freshness metadata
- `wp_blueprint_context` — assemble bounded task context
- `wp_blueprint_create` — create a draft blueprint; requires `project_id` and accepts optional `request_id` and `head_at_ingest` for retry-safe, stale-write-safe creation
- `wp_blueprint_put` — whole-document structured authoring; writes the canonical blueprint markdown from typed input and returns revision metadata
- `wp_blueprint_transition` — optimistic-concurrency lifecycle transition; requires `expected_version` and returns updated revision metadata
- `wp_blueprint_task_next` — return the next ready task; accepts optional `project_id` when the current cwd is a multi-repo workspace container
- `wp_blueprint_task_advance` — change task status (non-`done`); requires `project_id` and accepts optional `request_id` and `head_at_ingest` for retry-safe mutation
- `wp_blueprint_task_verify` — mark a task `done` with evidence; accepts optional `request_id` and `head_at_ingest` for retry-safe verification
- `wp_blueprint_promote` / `wp_blueprint_finalize` — accept optional `project_id` for nested-workspace disambiguation

Guidance:

- Prefer `project_id` from `wp_blueprint_projects` when multiple repos are visible.
- Use `request_id` for retry-safe mutations and reuse it only with the same payload.
- Carry `head_at_ingest` from read/context tools into stale-write-sensitive mutations.
- Author documents through `wp_blueprint_put`, then lifecycle with `wp_blueprint_transition`.
- Deferred `wp_blueprint_patch` semantic ops (`add_task`, `update_task`, `set_summary`, `replace_decision`) are future layers; patch is **not** part of the v1 canonical surface.
- MCP Apps editor support is a follow-on enhancement over `wp_blueprint_put` / `wp_blueprint_transition`.
- Hosts without MCP Apps support keep using the structured tools above.
