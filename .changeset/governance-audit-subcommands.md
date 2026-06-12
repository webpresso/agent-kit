---
"@webpresso/agent-kit": minor
---

Add four governance `wp audit` subcommands and fix unit test suite timeout.

**New subcommands:**
- `wp audit secrets-policy` — scans working tree and git-tracked files for forbidden secret carriers (`.env`, `.dev.vars`, credential files); gates on `.webpresso/secrets.config.json` presence
- `wp audit no-dev-vars` — flags `.dev.vars` and `.env` files in the repo tree; gates on `.webpresso/secrets.config.json` presence
- `wp audit secret-provider-quarantine` — scans source for direct secret-provider invocations and provider-specific flags; gates on `.webpresso/secrets.config.json` presence
- `wp audit secrets-config` — validates `.webpresso/secrets.config.json` exists, is valid JSON, and contains no embedded secret values

These replace the per-consumer `bun scripts/verify-secrets-policy.ts`, `bun scripts/check-no-dev-vars.ts`, and `bun scripts/audit-secret-provider-quarantine.ts` scripts. Consumer repos now call `wp audit <subcommand>` from pre-commit hooks and CI.

`secret-provider-quarantine` detects direct provider invocations (e.g. running the secret manager CLI directly or passing provider-specific flags) and requires the `with-secrets -- <cmd>` abstraction instead.

**Fix:** Removed `--maxWorkers 1` from `UNIT_SUITE_RUN` — this flag forced serial vitest execution across ~440 unit files (~133s wall-clock), exceeding the `wp_test` MCP tool's 110s cap. Parallel execution restores ~50s wall-clock.
