---
description: Manage blueprints via structured MCP tools (SQLite-first, multi-project)
---

# Blueprint MCP Tools

The blueprint MCP surface is a set of focused tools backed by a SQLite projection.
Markdown files remain the durable source of truth; SQLite is derived and rebuilt on demand.

## Quick smoke path (under 2 minutes)

```
# 1. Discover projects visible to the MCP server
ak_blueprint_projects

# 2. List blueprints in the current project
ak_blueprint_list

# 3. Fetch a specific blueprint with freshness metadata
ak_blueprint_get  slug="my-feature"

# 4. Mark a task done with verified evidence
ak_blueprint_task_verify  project_id="..." slug="my-feature" task_id="1.1" \
  evidence='[{"kind":"test","ref":"src/foo.test.ts","result":"pass"}]'
```

## Tool reference

| Tool | Purpose | Scope |
|------|---------|-------|
| `ak_blueprint_projects` | Discover projects (current + MCP roots + workspace + git worktrees) | read |
| `ak_blueprint_list` | List blueprints; filter by status; supports multi-project scope | read |
| `ak_blueprint_get` | Fetch full blueprint + tasks + freshness metadata by slug | read |
| `ak_blueprint_context` | Assemble bounded context chunks for a task | read |
| `ak_blueprint_create` | Write `blueprints/draft/<slug>/_overview.md` and re-ingest | mutate |
| `ak_blueprint_task_advance` | Advance task status (not to `done` — use verify instead) | mutate |
| `ak_blueprint_task_verify` | Mark task done with Evidence Contract; idempotent | mutate |

### Multi-project scope (read tools only)

Pass `scope` to widen reads beyond the current project:

| `scope` value | Projects included |
|---------------|-------------------|
| `'current'` (default) | Working directory project only |
| `'roots'` | MCP client advertised roots |
| `'workspace'` | `~/.agent/workspace.yaml` repos |
| `'all'` | Roots + workspace + recursive scan |

Mutation tools (`ak_blueprint_create`, `ak_blueprint_task_verify`, `ak_blueprint_task_advance`)
never accept `scope` — they require an explicit `project_id`.

### Evidence Contract (`ak_blueprint_task_verify`)

Evidence items are typed by `kind`:

| `kind` | Required fields |
|--------|----------------|
| `'test'` | `ref` (file path), `result: 'pass'` |
| `'integration'` | `ref`, `result: 'pass'` |
| `'audit'` | `ref`, `result: 'pass'` |
| `'manual'` | `description`, `result: 'pass'` |

At least one `result: 'pass'` item required; any `result: 'fail'` item blocks completion.
Re-calling with identical canonical evidence on an already-`done` task is a no-op success.

## Old → new mapping

| Legacy `ak_blueprint` action | New tool |
|------------------------------|----------|
| `action: 'list'` | `ak_blueprint_list` |
| `action: 'get'` | `ak_blueprint_get` |
| `action: 'new'` | `ak_blueprint_create` |
| `action: 'advance'` | `ak_blueprint_task_advance` |
| `action: 'done'` | `ak_blueprint_task_verify` (with evidence) |

`ak_blueprint` is no longer registered. Use the specific tools above.

## Freshness

Every response includes `freshness_ok` and `head_at_ingest`. If `freshness_ok` is false,
the response includes `next_action: { kind: 'reingest_project', hint: '...' }`.
Re-call `ak_blueprint_list` (or any read tool) with the same project — it will trigger re-ingest.
