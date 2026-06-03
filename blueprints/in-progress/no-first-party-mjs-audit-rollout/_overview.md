---
type: blueprint
title: No first-party .mjs audit rollout
status: in-progress
complexity: M
owner: agent
created: '2026-06-03'
last_updated: '2026-06-03'
progress: "67% (audit kind is wired through shared CLI/MCP surfaces and the orphan probe is retired; final public-contract proof is still pending)"
---

# No first-party .mjs audit rollout

## Summary

Make `agent-kit` the single policy owner for the "no tracked first-party
`.mjs`" rule, expose it on the canonical `wp audit` CLI/MCP surfaces, and use
consumer-repo adoption work only for local cleanup plus workflow enforcement.

## Tasks

#### Task 1: add the shared audit surface

**Status:** in_progress
**Files:**

- `src/audit/no-first-party-mjs.ts`
- `src/audit/no-first-party-mjs.test.ts`
- `src/cli/commands/audit-core.ts`
- `src/cli/commands/audit.ts`
- `src/mcp/tools/audit.ts`

**Acceptance:**

- [ ] `wp audit no-first-party-mjs` fails on tracked first-party `.mjs`.
- [ ] generated/vendor/cache paths are excluded on the shared audit surface.
- [ ] non-canonical roots fail loudly instead of silently scanning umbrellas.

#### Task 2: retire the orphan probe

**Status:** in_progress
**Files:**

- `src/mcp/tools/_shared/project-root.test.ts`
- delete `test-import-mcp.mjs`

**Acceptance:**

- [ ] dynamic import coverage lives in the existing Vitest suite.
- [ ] the orphan `.mjs` probe file is deleted.

#### Task 3: prove the public contract

**Status:** pending
**Files:**

- `src/cli/commands/audit.test.ts`
- `src/mcp/tools/audit.test.ts`
- `src/mcp/server.integration.test.ts`

**Acceptance:**

- [ ] CLI registration covers the new audit kind.
- [ ] MCP registration covers the new audit kind.
- [ ] tool-list integration evidence includes `no-first-party-mjs`.
