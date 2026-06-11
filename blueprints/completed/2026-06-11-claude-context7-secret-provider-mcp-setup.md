---
type: blueprint
title: "Claude Context7 MCP setup through agent-kit secret provider"
owner: agent-kit
status: completed
complexity: S
created: '2026-06-11'
last_updated: '2026-06-11'
progress: '100% (3 of 3 tasks completed)'
tags:
  - setup
  - mcp
  - secrets
  - claude
---

# Claude Context7 MCP setup through agent-kit secret provider

## Product wedge anchor

- **Stage outcome:** `wp setup` configures Context7 for both Codex and Claude without writing the Context7 API key to disk.
- **Consuming surface:** users with `wp config secrets` configured, including Doppler-backed installations.
- **New user-visible capability:** Claude Code can load Context7 from project `.mcp.json` when launched through the agent-kit secret-provider wrapper.

## Scope

Extend the existing Claude `.mcp.json` scaffolder with a Context7 HTTP server entry that uses Claude Code's environment-variable expansion in `headers`. The secret value remains owned by the configured agent-kit secret provider; setup must not shell out to `doppler secrets get`, persist `.env`, or write raw header values.

## Tasks

#### Task 1.1: Model Claude Context7 MCP entry

**Status:** done

**Depends:** None

**Acceptance:**

- [x] Add constants/upsert support for `.mcp.json#mcpServers.context7`.
- [x] Use `type = "http"` JSON shape with `url = "https://mcp.context7.com/mcp"` and `headers.CONTEXT7_API_KEY = "${CONTEXT7_API_KEY}"`.
- [x] Preserve unrelated MCP servers and make repeated setup idempotent.

**Verification:** `wp_test` for `src/cli/commands/init/scaffolders/codex-mcp/index.test.ts`.

#### Task 1.2: Integrate with `wp setup`

**Status:** done

**Depends:** Task 1.1

**Acceptance:**

- [x] Ensure the setup path writes the Claude Context7 entry alongside existing Claude Playwright MCP setup.
- [x] Surface usage guidance that launch must happen through `with-secrets -- claude` when the key comes from the configured secret provider.
- [x] Do not introduce provider-specific Doppler commands into generated runtime config.

**Verification:** `wp_test` for `src/cli/commands/init/init.presets.integration.test.ts`.

#### Task 1.3: Verification

**Status:** done

**Depends:** Task 1.2

**Acceptance:**

- [x] Add focused unit/integration tests for creation, idempotence, and raw-header replacement.
- [x] Run focused tests, lint, typecheck, format, and relevant audits.
- [x] Run live no-secret smoke for secret-provider injection and Context7 MCP initialize.

**Verification:** `./bin/with-secrets --env-profile dev -- python3 -c ...` returned `context7_http_status=200` and `context7_initialize_result=true` without printing the secret.

## Acceptance criteria

- [x] `wp setup` writes Claude Context7 remote MCP config using env-expanded headers.
- [x] No raw Context7 key value is read or persisted by agent-kit.
- [x] The implementation uses the canonical secret-provider contract, not direct `doppler run` guidance.
- [x] Tests cover idempotence and preservation.
