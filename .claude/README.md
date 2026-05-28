# `.claude/` policy

This repo treats `.claude/` runtime surfaces as **generated / local** for gitignore purposes.

Ignored surfaces include:

- `settings.json`
- `settings.local.json`
- `hooks/`
- `rules/`
- `agents/`
- `skills/`
- `worktrees/`
- `scheduled_tasks.lock`

Canonical sources should live in repo-owned surfaces such as `catalog/agent/`,
not in `.claude/` projections.
