---
description: Manage blueprints via focused MCP tools
---
Use the focused blueprint MCP tools.

- `wp_blueprint_projects` — discover visible projects and worktrees
- `wp_blueprint_list` — list blueprints
- `wp_blueprint_get` — fetch one blueprint with freshness metadata
- `wp_blueprint_context` — assemble bounded task context
- `wp_blueprint_create` — create a draft blueprint; requires `project_id` and accepts optional `request_id` and `head_at_ingest` for retry-safe, stale-write-safe creation
- `wp_blueprint_task_next` — return the next ready task; accepts optional `project_id` when the current cwd is a multi-repo workspace container
- `wp_blueprint_task_advance` — change task status (non-`done`); requires `project_id` and accepts optional `request_id` and `head_at_ingest` for retry-safe mutation
- `wp_blueprint_task_verify` — mark a task `done` with evidence; accepts optional `request_id` and `head_at_ingest` for retry-safe verification
- `wp_blueprint_promote` / `wp_blueprint_finalize` — accept optional `project_id` for nested-workspace disambiguation

Mutation guidance:

- Use `request_id` on `wp_blueprint_create`, `wp_blueprint_task_advance`, and
  `wp_blueprint_task_verify` when the caller may retry the same request.
- Prefer passing `project_id` from `wp_blueprint_projects` whenever the current
  working directory can see more than one blueprint-bearing repo.
- Carry `head_at_ingest` from `wp_blueprint_list`, `wp_blueprint_get`, or
  `wp_blueprint_context` into mutation calls when the caller needs stale-write
  protection across retries or multi-agent handoff.
- Reusing the same `request_id` with the same payload is idempotent.
- Reusing the same `request_id` with a different payload is rejected.
- If `head_at_ingest` is stale, the mutation is rejected and points the caller
  back to a canonical `wp_*` refresh path.
