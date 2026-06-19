---
type: blueprint
title: "Claude CLI auth detection hardening"
owner: ozby
status: planned
complexity: S
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "0% (planned; blueprint-only PR)"
tags:
  - claude
  - auth
  - benchmark
  - agents
---

# Claude CLI auth detection hardening

## Planning Summary

The current cross-agent workflows can incorrectly treat a first-party Claude CLI login as unauthenticated when no `ANTHROPIC_API_KEY` or legacy credentials file exists. In this session, `claude auth status` reported a logged-in `claude.ai` Max account while `claude -p` initially failed with `401`; after the user refreshed the CLI session, `claude -p` succeeded.

This blueprint hardens repo-owned Claude execution paths so auth diagnostics match actual Claude Code behavior and are testable without live credentials.

## Scope

### In scope
- Identify repo-owned Claude invocation/auth-check paths in agent-kit.
- Prefer `claude auth status` for CLI login detection where Claude CLI is the execution backend.
- Treat `ANTHROPIC_API_KEY` as optional fallback, not a requirement, for local single-workspace Claude CLI login flows.
- Add a mockable command-runner seam for `claude auth status` and `claude -p`.
- Update benchmark/review docs and tests that still imply API key is always required.

### Out of scope
- Editing generated gstack skill files inside user cache.
- Changing Claude CLI itself.
- Making isolated benchmark proof runs use one shared Claude login; API keys remain required for isolated workspace proof mode.
- Storing or printing credentials.

## Auth Contract

```ts
type ClaudeCliAuthState =
  | { kind: 'cli-login'; provider: 'firstParty' | string; email?: string; subscriptionType?: string }
  | { kind: 'api-key'; source: 'ANTHROPIC_API_KEY' }
  | { kind: 'missing'; reason: string }
  | { kind: 'execution-failed'; auth: 'cli-login' | 'api-key' | 'unknown'; status?: number; message: string }
```

Rules:
- `claude auth status` success with `loggedIn: true` is valid CLI auth even without `ANTHROPIC_API_KEY`.
- `ANTHROPIC_API_KEY` remains valid API-key auth.
- If auth status is valid but `claude -p` returns `401`, report stale/broken Claude CLI execution auth and recommend refreshing Claude CLI login/session.
- If API-key mode is active and execution returns `401`, report API-key auth failure.
- Do not parse secrets or include raw tokens in output.

## Side-effect Classification

| Operation | Side effects | Safety rule |
| --------- | ------------ | ----------- |
| `claude auth status` | Read-only | Safe diagnostic |
| `claude -p` smoke probe | External network/API call | Use only when explicitly validating execution path; keep prompt minimal |
| Benchmark/review invocation | External network/API call | Existing explicit command behavior; no credential persistence |

## Tasks

### Task 1: Locate and isolate repo-owned Claude auth paths

- [ ] **Status:** todo
- **Depends:** None
- **Files:** `scripts/bench/*`, `src/cli/commands/bench/*`, runner selection/docs as discovered
- **Steps:** Grep for `ANTHROPIC_API_KEY`, `claude -p`, and Claude auth checks; classify repo-owned, docs-only, and external gstack-owned paths.
- **Acceptance:** The implementation PR does not edit generated cache skill files and names any cross-repo handoff separately.

### Task 2: Implement mockable auth detection

- [ ] **Status:** todo
- **Depends:** Task 1
- **Files:** new or existing Claude auth helper plus unit tests
- **Steps:** Add parser for `claude auth status`, add execution-probe classification, and cover CLI-login/no-key, API-key, missing CLI, stale execution token, and malformed output.
- **Acceptance:** Tests prove logged-in Claude CLI without API key passes the auth gate.

### Task 3: Update benchmark/review diagnostics

- [ ] **Status:** todo
- **Depends:** Task 2
- **Files:** benchmark manifest/session-memory docs/tests and runner selection paths as applicable
- **Steps:** Keep isolated proof mode API-key requirements intact, ensure local `BENCH_AUTH_MODE=claude-login` flows do not demand API keys, and update stale-login error text.
- **Acceptance:** Docs and tests distinguish API-key proof mode from local CLI-login smoke mode.

## Test Plan

- Unit tests for auth helper with injected command results.
- Existing benchmark manifest/session-memory auth tests.
- `vp run test` for changed files.
- `vp run blueprints:check`.
- Final implementation PR: `vp run typecheck`, `vp run lint`, affected tests.

## PR Acceptance Criteria

- [ ] First-party `claude.ai` login with no API key is accepted where local CLI login is supported.
- [ ] `401` after valid CLI auth produces a stale-session diagnostic, not an API-key requirement.
- [ ] API-key proof mode semantics are unchanged.
- [ ] No credentials are written, printed, or committed.
