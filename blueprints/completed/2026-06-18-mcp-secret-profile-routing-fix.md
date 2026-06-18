---
type: blueprint
title: MCP secret profile routing fix
owner: ozby
status: completed
completed_at: '2026-06-18'
complexity: M
created: '2026-06-18'
last_updated: '2026-06-18'
progress: '100% (4/4 tasks done, 0 blocked, updated 2026-06-18)'
depends_on: []
cross_repo_depends_on: []
tags:
  - mcp
  - secrets
  - ci
  - e2e
---

# MCP secret profile routing fix

## Status

Completed on 2026-06-18.

## Problem

Secret-aware MCP tools could execute from the MCP server process cwd instead of
the caller repository root. In practice, `wp_e2e` resolved secrets from stale
runtime config and tried the wrong Doppler project instead of the repo-local
`.webpresso/secrets.config.json` metadata.

`wp_ci_act` also used one `envProfile` string for two different concepts:
secret-gate runtime profile and provider-specific Doppler/Infisical environment
selector. Passing a workflow/runtime label such as `e2e-runtime` could therefore
be sent to Doppler as `--config e2e-runtime`.

## Scope

- Make `wp_e2e` resolve the MCP project root before planning and executing
  commands.
- Make E2E command execution use the caller cwd when an individual planned
  command does not set its own cwd.
- Split secret-gate runtime profiles from provider environment selectors:
  - `envProfile`: canonical runtime profile (`none`, `public`,
    `secrets-only`, `service-runtime`, `database`, `full`)
  - `secretEnvProfile`: provider-specific selector such as Doppler `dev`
- Make `wp_ci_act` resolve the MCP project root and reject provider selectors in
  `envProfile` with guidance to use `secretEnvProfile`.

## Acceptance criteria

- `wp_e2e` planning and execution receive the resolved repository root.
- Secret resolution for MCP-spawned E2E commands reads the caller repo config,
  not the MCP server/plugin cwd.
- `wp_ci_act` no longer maps arbitrary `envProfile` values to Doppler configs.
- `wp_ci_act` can still pass a provider selector explicitly through
  `secretEnvProfile`.
- CLI/docs describe the split contract.

## Verification

```json
[
  {
    "command": "./bin/wp test --file src/runtime/with-secrets-cli.test.ts --file src/runtime/executor.test.ts --file src/secret-gate/runner.test.ts --file src/ci/act-runner.test.ts --file src/cli/commands/ci.test.ts --file src/mcp/tools/ci-act.test.ts --file src/mcp/tools/e2e.test.ts --file src/e2e/execution.test.ts",
    "exit_code": 0,
    "result": "pass"
  },
  {
    "command": "./bin/wp lint --file src/mcp/tools/e2e.ts --file src/mcp/tools/e2e.test.ts --file src/e2e/execution.ts --file src/e2e/execution.test.ts --file src/mcp/tools/ci-act.ts --file src/mcp/tools/ci-act.test.ts --file src/ci/act-runner.ts --file src/ci/act-runner.test.ts --file src/cli/commands/ci.ts --file src/cli/commands/ci.test.ts --file src/secret-gate/runner.ts --file src/secret-gate/runner.test.ts --file src/runtime/executor.ts --file src/runtime/executor.test.ts --file src/runtime/with-secrets-cli.ts --file src/runtime/with-secrets-cli.test.ts --file docs/ci-act.md",
    "exit_code": 0,
    "result": "pass"
  },
  {
    "command": "./bin/wp typecheck",
    "exit_code": 0,
    "result": "pass"
  },
  {
    "command": "./bin/wp audit secrets-config && ./bin/wp audit secret-provider-quarantine && ./bin/wp audit secrets-policy",
    "exit_code": 0,
    "result": "pass"
  }
]
```
