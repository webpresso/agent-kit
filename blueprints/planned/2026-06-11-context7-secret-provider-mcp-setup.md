---
type: blueprint
title: "Context7 MCP setup through agent-kit secret provider"
owner: agent-kit
status: planned
complexity: S
created: 2026-06-11
last_updated: 2026-06-11
progress: '0% (0 of 3 tasks completed)'
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

- [ ] Add constants/upsert support for `[mcp_servers.context7]`.
- [ ] Use `url = "https://mcp.context7.com/mcp"` and `env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }`.
- [ ] Preserve unrelated MCP servers and make repeated setup idempotent.

### Task 2: Integrate with `wp setup`

- [ ] Ensure the Codex MCP setup path writes the Context7 block alongside existing managed MCP blocks.
- [ ] Surface usage guidance that launch must happen through `with-secrets -- codex` when the key comes from the configured secret provider.
- [ ] Do not introduce provider-specific Doppler commands into generated runtime config.

### Task 3: Verification

- [ ] Add focused unit tests for empty config, replacement/idempotence, and preservation of existing servers.
- [ ] Run focused tests and typecheck or record blockers.

## Acceptance criteria

- [ ] `wp setup` path writes Context7 remote MCP config using env-backed headers.
- [ ] No raw Context7 key value is read or persisted by agent-kit.
- [ ] The implementation uses the canonical secret-provider contract, not direct `doppler run` guidance.
- [ ] Tests cover idempotence and preservation.
