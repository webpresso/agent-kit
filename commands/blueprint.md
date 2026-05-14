---
description: Manage blueprints via focused MCP tools
---
Use the focused blueprint MCP tools instead of the removed legacy facade `mcp__agent-kit__ak_blueprint(...)`.

- `ak_blueprint_projects` — discover visible projects and worktrees
- `ak_blueprint_list` — list blueprints
- `ak_blueprint_get` — fetch one blueprint with freshness metadata
- `ak_blueprint_context` — assemble bounded task context
- `ak_blueprint_create` — create a draft blueprint
- `ak_blueprint_task_advance` — change task status (non-`done`)
- `ak_blueprint_task_verify` — mark a task `done` with evidence
