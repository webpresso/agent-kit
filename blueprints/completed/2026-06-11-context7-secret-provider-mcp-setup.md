---
type: blueprint
title: "Context7 MCP setup through agent-kit secret provider"
owner: agent-kit
status: completed
historical_verification_gap_waiver: true
complexity: S
created: 2026-06-11
last_updated: 2026-06-11
progress: '100% (3 of 3 tasks completed)'
tags:
  - setup
  - mcp
  - secrets
  - codex
---

# Context7 MCP setup through agent-kit secret provider

## Product wedge anchor

- **Stage outcome:** `wp setup` configures Context7 for Codex without writing the Context7 API key to disk.
- **Consuming surface:** users with `wp config secrets` configured, including Doppler-backed installations.
- **New user-visible capability:** Codex Context7 MCP is available when launched through the agent-kit secret-provider wrapper (`with-secrets -- codex`).

## Scope

Add a small setup/scaffolder path that registers Context7's remote MCP server in Codex config with `env_http_headers`, mapping the `CONTEXT7_API_KEY` HTTP header from the environment variable of the same name. The secret value remains owned by the configured agent-kit secret provider; setup must not shell out to `doppler secrets get`, persist `.env`, or write raw `http_headers` with secret values.

## Tasks

### Task 1: Model Context7 Codex MCP block

- [x] Add constants/upsert support for `[mcp_servers.context7]`.
- [x] Use `url = "https://mcp.context7.com/mcp"` and `env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }`.
- [x] Preserve unrelated MCP servers and make repeated setup idempotent.

**Verification:** `wp test src/cli/commands/init/scaffolders/codex-mcp/index.test.ts src/cli/commands/init/init.presets.integration.test.ts`

### Task 2: Integrate with `wp setup`

- [x] Ensure the Codex MCP setup path writes the Context7 block alongside existing managed MCP blocks.
- [x] Surface usage guidance that launch must happen through `with-secrets -- codex` when the key comes from the configured secret provider.
- [x] Do not introduce provider-specific Doppler commands into generated runtime config.

**Verification:** `wp test src/cli/commands/init/scaffolders/codex-mcp/index.test.ts src/cli/commands/init/init.presets.integration.test.ts`

### Task 3: Verification

- [x] Add focused unit tests for empty config, replacement/idempotence, and preservation of existing servers.
- [x] Run focused tests and typecheck or record blockers.

**Verification:** `wp test src/cli/commands/init/scaffolders/codex-mcp/index.test.ts src/cli/commands/init/init.presets.integration.test.ts`; `wp typecheck`; `wp lint src/cli/commands/init/scaffolders/codex-mcp/index.ts src/cli/commands/init/scaffolders/codex-mcp/index.test.ts src/cli/commands/init/index.ts src/cli/commands/init/init.presets.integration.test.ts`

## Acceptance criteria

- [x] `wp setup` path writes Context7 remote MCP config using env-backed headers.
- [x] No raw Context7 key value is read or persisted by agent-kit.
- [x] The implementation uses the canonical secret-provider contract, not direct `doppler run` guidance.
- [x] Tests cover idempotence and preservation.
