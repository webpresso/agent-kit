---
type: system
last_updated: '2026-05-11'
---

# Blueprint DB Cookbook

The blueprint structured store indexes every blueprint, task, tech-debt item, and
cross-repo dependency in a local SQLite database (`<repo>/.agent/.blueprints.db`).
Pre-registered SQL templates give you safe, parameterised access to the most
useful slices of that data without ever writing raw SQL.

---

## 1. Using templates via `ak blueprint db query`

```
ak blueprint db query <template-id> [--param key=value ...]
```

- `<template-id>` — one of the names listed in `src/blueprint/db/templates.ts`
- `--param` — pass zero or more named parameters; unknown or invalid params are
  rejected before the query runs (Zod validation)

**List all available templates:**

```
ak blueprint db query --list
```

---

## 2. Worked example: `next-ready-task`

*"What should an agent work on next?"*

This template returns `todo` tasks in `in-progress` blueprints whose declared
task-dependencies are all `done`. Tasks are ordered by blueprint complexity
(XL first) then by `task_id`.

```
ak blueprint db query next-ready-task
```

Returns up to 5 rows by default. Override:

```
ak blueprint db query next-ready-task --param limit=10
```

Typical output columns: `task_id`, `title`, `status`, `wave`,
`blueprint_slug`, `blueprint_title`.

**Why this is useful:** at the start of a session you can ask the structured
store which task has the highest priority and zero unmet dependencies — instead
of grepping markdown files.

---

## 3. Worked example: `tech-debt-due-soon`

*"Which tech-debt items need review in the next two weeks?"*

```
ak blueprint db query tech-debt-due-soon
```

Default window is 14 days, default row limit is 20. To widen the window:

```
ak blueprint db query tech-debt-due-soon --param days=30 --param limit=50
```

Items with `status = 'resolved'` are excluded. Results are ordered by
`next_review` ascending then by `severity`.

Typical output columns: `slug`, `status`, `severity`, `category`,
`next_review`, `review_cadence`, `organization`.

---

## 4. Adding a custom template

1. Open `src/blueprint/db/templates.ts`.
2. Add a new entry to `QUERY_TEMPLATES`:

```typescript
{
  id: 'my-custom-query',
  description: 'Short description shown in --list output.',
  sql: `
    SELECT slug, title, status
    FROM blueprints
    WHERE owner = :owner
    LIMIT :limit
  `.trim(),
  paramSchema: z.object({
    owner: z.string().min(1),
    limit: z.number().int().positive().max(200).optional(),
  }),
  maxRows: 200,
},
```

Rules:
- SQL must be valid **SQLite** — use `CASE` not `IF`; no `RETURNING` without a
  schema-version check.
- Every user-supplied value must be a named binding (`:param`). String
  interpolation into SQL is forbidden — `template-runner.ts` validates and
  filters all params through Zod before execution.
- Set `maxRows` conservatively; the runner caps `LIMIT` to this value even if
  the caller requests more.

3. Add a test in `src/blueprint/db/templates.test.ts` that exercises the new
   template against fixture data (at minimum a syntax-validity check via
   `db.prepare()` plus a correctness check).

---

## 5. Cross-repo correlation query example

*"Which of our blueprints depend on work in other organisations?"*

```
ak blueprint db query cross-org-correlations
```

This returns every row in `cross_repo_dependencies` where `is_cross_org = 1`,
joined to the local blueprint's `slug` and `organization`. Use this to identify
coordination obligations with external teams before starting sprint planning.

For a narrower view limited to unresolved cross-repo deps in a specific org:

```
ak blueprint db query cross-repo-blocked-on --param org_filter=acme-corp
```

`org_filter` matches the leading characters of `target_repo`
(e.g. `acme-corp/` prefix), so any repo under that org is included.

---

## Available templates

| ID | Description |
|----|-------------|
| `next-ready-task` | Todo tasks with all dependencies satisfied, ordered by blueprint complexity |
| `blocked-blueprints` | In-progress blueprints where every remaining task is blocked |
| `tech-debt-due-soon` | Unresolved tech-debt due within N days (default 14) |
| `blueprint-risk-profile` | HIGH/CRITICAL risks in planned or in-progress blueprints |
| `cross-repo-blocked-on` | Unresolved cross-repo dependencies, optionally filtered by org |
| `cross-org-correlations` | Cross-repo deps that span organisation boundaries |
| `completed-this-month` | Blueprints completed in the current calendar month |
| `overdue-tech-debt` | Tech-debt items past their review date, by severity |
| `in-progress-blueprints` | All in-progress blueprints with per-status task counts |

Source of truth for all templates: `src/blueprint/db/templates.ts`.
Template runner implementation: `src/blueprint/db/template-runner.ts`.
