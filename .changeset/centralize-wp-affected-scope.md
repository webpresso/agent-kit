---
"@webpresso/agent-kit": patch
---

Centralize the `--affected` scope contract across the `wp` quality commands (lint, test, typecheck, format, and `audit guardrails`) and the generated base-kit pre-commit hook, so affected-file targeting is computed consistently from a single shared helper (`src/git/affected.ts`, `src/typecheck/affected.ts`). See `blueprints/planned/2026-06-25-centralize-wp-affected-contract.md`.
