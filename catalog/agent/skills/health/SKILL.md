---
name: health
description: |
  Code quality dashboard. Runs available project checks, summarizes failures by category, and gives a pragmatic 0-10 health score with next actions.
license: MIT
---

# Health check

Use when asked for code quality, health check, run all checks, or quality score.

## Method

1. Prefer repo facades (`wp typecheck`, `wp lint`, `wp format --check`, `wp test`, audits) over raw tool binaries.
2. Run only checks that are available and relevant; record skipped checks with reasons.
3. Score from 0-10 based on correctness, tests, lint/type safety, security/path/secret audits, and maintainability.
4. Return a concise dashboard: score, pass/fail table, top risks, and recommended next command.
