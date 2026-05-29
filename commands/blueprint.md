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

Mutation guidance:

- V1 structured authoring is limited to `wp_blueprint_put + wp_blueprint_transition`.
- Use `request_id` on `wp_blueprint_create`, `wp_blueprint_put`,
  `wp_blueprint_task_advance`, and `wp_blueprint_task_verify` when the caller
  may retry the same request.
- Prefer passing `project_id` from `wp_blueprint_projects` whenever the current
  working directory can see more than one blueprint-bearing repo.
- Carry `head_at_ingest` from `wp_blueprint_list`, `wp_blueprint_get`, or
  `wp_blueprint_context` into `wp_blueprint_create`, `wp_blueprint_put`, and
  other mutation calls when the caller needs stale-write protection across
  retries or multi-agent handoff.
- Reusing the same `request_id` with the same payload is idempotent.
- Reusing the same `request_id` with a different payload is rejected.
- If `head_at_ingest` is stale, the mutation is rejected and points the caller
  back to a canonical `wp_*` refresh path.
- `wp_blueprint_transition` uses `expected_version` (the current
  `content_hash`) for blueprint-scoped optimistic concurrency.

Deferred patch boundary:

- `wp_blueprint_patch` is **not** part of the v1 canonical surface.
- If/when added, the patch model must be **semantic**, not raw markdown
  mutation.
- Minimum deferred operations:
  - `add_task`
  - `update_task`
  - `set_summary`
  - `replace_decision`
- Until then, whole-document `wp_blueprint_put` is the canonical authoring path.

Deferred UI/editor boundary:

- A future MCP Apps blueprint editor is an **enhancement**, not part of the v1
  correctness path.
- Any UI flow must layer on top of `wp_blueprint_put + wp_blueprint_transition`
  instead of introducing a parallel write surface.
- Hosts without MCP Apps support must still complete the full authoring flow
  through the structured tools alone.
- Minimum v2 editor contract:
  - capability detection for MCP Apps support
  - structured form/editor over the full blueprint document
  - non-UI fallback guidance that routes back to `wp_blueprint_put` and
    `wp_blueprint_transition`
