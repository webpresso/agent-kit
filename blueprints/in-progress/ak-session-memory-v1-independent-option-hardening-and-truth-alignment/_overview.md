---
type: blueprint
title: session-memory v1 — independent option hardening and truth alignment
owner: agent-kit
status: in-progress
complexity: M
created: '2026-06-12'
last_updated: '2026-06-12'
progress: 'Implementation pass underway on PR #94; verification and PR narrative update pending'
depends_on: []
tags:
  - session-memory
  - v1
  - sqlite
  - fts5
  - truth-alignment
  - lane-2
---

# session-memory v1 — independent option hardening and truth alignment

## Locked framing

v1 is a standalone replacement candidate for the current context tool. It is not
phase 1 of v2 and must not be described as a linear upgrade path. The public
candidate contract for this wave remains `ak_session_*`.

## Purpose

Convert PR #94 from “green and marked complete” into an honestly scoped
independent candidate PR. The PR may be benchmark-ready only where evidence
exists; the final ship/park decision belongs to the benchmark-selection
blueprint.

## Scope

In scope:

- DRY cleanup in the TypeScript store layer.
- Testing-philosophy hardening with real SQLite integration coverage.
- Packaged hook/bin truth for `wp-post-tool` and `wp-pre-compact`.
- Public docs truth using “current context tool” narrative language.
- Canonical parity matrix completion for current baseline, v1, and v2.
- PR #94 title/body rewrite to the session-memory PR contract.

Out of scope:

- Declaring v1 shipped by default.
- Removing the current context tool from setup defaults.
- Taking ownership of v2 continuation work.
- Changing the `ak_session_*` public contract.

## Tasks

- [x] Route packaged/direct `wp-post-tool` through the dispatcher, not the old
      lint-only entrypoint.
- [x] Add packaged/runtime/scaffolded `wp-pre-compact` truth where the docs and
      hook matrix claim pre-compaction snapshot support.
- [x] Extract shared store schema/search helpers to avoid duplicated TS/Bun
      SQLite logic.
- [x] Add real integration coverage for capture → snapshot → restore and
      execute → index → search behavior.
- [x] Add/update `docs/session-memory-option-matrix.md`.
- [x] Rewrite active session-memory docs with independent-option framing.
- [x] Update PR #94 title/body to the standardized narrative contract.
- [x] Run final focused tests, lint, typecheck, and terminology grep checks.

## Acceptance criteria

- `ak_session_*` remains the public candidate surface.
- v1 docs say “candidate” unless a claim has evidence.
- Active public prose uses “current context tool” except exact technical
  identifiers such as file paths, env vars, command literals, and historical
  provenance.
- Hook/bin claims match package and runtime launcher truth.
- Matrix cells use only `shipped`, `partial`, `planned`, `blocked`, or
  `unknown / not yet proven`.
- PR #94 does not claim final replacement selection.

## Verification plan

- `vp run typecheck`
- focused Vitest suites for launcher, hook scaffolding, hook entrypoints,
  session-memory store/session/MCP integration
- `vp run lint`
- `vp run format:check`
- `vp run docs:check`
- `vp run blueprints:check`
- targeted grep for direct current-tool product-name prose in active docs/rules

## Execution tasks

#### [agent-kit] Task 1.1: Hook/bin truth alignment

**Status:** done

Ensure packaged and direct hook bins route to the same implementation paths that
docs and setup claim.

**Verification:** Focused launcher and hook tests.

#### [agent-kit] Task 1.2: Store DRY cleanup

**Status:** done

Extract shared schema/search helpers used by the better-sqlite3 and bun:sqlite
bindings.

**Verification:** Session store tests and typecheck.

#### [agent-kit] Task 1.3: Integration proof

**Status:** done

Add real SQLite integration coverage for candidate capture/snapshot/restore and
execute/index/search flows.

**Verification:** `src/session-memory/session-memory.integration.test.ts`.

#### [docs] Task 1.4: Public narrative truth alignment

**Status:** in-progress

Update active docs, matrix, PR template, and PR #94 body/title to describe v1 as
an independent replacement candidate.

**Verification:** PR #94 title/body updated via `gh pr edit`; final local gates passed on 2026-06-12.


## Verification evidence (2026-06-12)

- `vp run format` — applied formatting.
- `vp run format:check` — passed.
- `vp run typecheck` — passed.
- `vp run lint` — passed.
- `vp run docs:check` — passed.
- `vp run catalog:check` — passed.
- `vp run blueprints:check` — passed.
- `WP_FORCE_SOURCE=1 bun src/cli/cli.ts audit blueprint-readme-drift` — passed.
- `WP_FORCE_SOURCE=1 bun src/cli/cli.ts audit package-surface` — passed.
- `bunx vitest run scripts/bin-launcher.test.ts src/cli/commands/hook.test.ts src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/hooks/bin-purity.test.ts src/hooks/post-tool/index.test.ts src/hooks/pre-compact/index.test.ts src/session-memory/store.test.ts src/session-memory/session.test.ts src/session-memory/session-memory.integration.test.ts src/mcp/tools/session-search.test.ts` — 11 test files / 153 tests passed.
- Terminology grep over active docs/rules/active blueprints leaves only exact identifier carve-outs: the `context-mode-routing` slug and literal config/command/script names in `docs/migration/context-mode-default.md`.
