---
type: blueprint
title: "Claude skill and wp_test targeting hardening"
owner: ozby
status: completed
complexity: M
created: "2026-06-21"
last_updated: "2026-06-21"
progress: "implemented and verified (5/5 tasks done, 0 blocked)"
tags:
  - claude
  - skills
  - mcp
  - testing
---

# Claude skill and wp_test targeting hardening

## Planning Summary

Fix three surfaced hardening gaps as one coherent pass: the shipped Claude outside-voice skill must use supported Claude CLI login checks, `wp_test` must accept `suite + files` without broadening targeted runs, and the SessionStart malformed-stdin regression must assert stable routing invariants despite optional continuity context.

## Scope

### In scope
- Update `packages/gstack/skills/claude.md` as the source of truth and regenerate staged/package skill surfaces.
- Prevent shipped Claude skill surfaces from reintroducing `claude auth status --output json`, API-key fallback auth, or credentials-file fallback auth.
- Allow `wp_test` and CLI `wp test --suite --file` to combine `suite` and explicit files by filtering the explicit file set only.
- Forward `suite` through `wp_qa` to `wp_test` without widening lint/typecheck inputs.
- Make SessionStart malformed-stdin assertions stable around routing-block ordering.

### Out of scope
- Editing installed plugin caches directly.
- Rebuilding packaged native runtime binaries.
- Adding new dependencies.

## Tasks

#### [skills] Task 1.1: Harden Claude skill auth snippet
- [x] **Status:** done
- **Files:** `packages/gstack/skills/claude.md`, `catalog/agent/skills/claude/SKILL.md`, `skills/claude/SKILL.md`, related tests
- **Acceptance:** Source, staged, and packaged skill surfaces use `claude auth status --json` with plain status fallback, require recognized truthy auth fields, and contain no stale API-key or credentials-file fallback snippet.

#### [mcp] Task 1.2: Preserve targeted test scope with suite + files
- [x] **Status:** done
- **Files:** `src/mcp/runners/test.ts`, `src/mcp/tools/test.test.ts`, `src/mcp/runners/test.test.ts`
- **Acceptance:** `wp_test(files + suite)` runs only matching explicit files or fails closed when no explicit file matches, never expanding to a broad suite.

#### [cli] Task 1.2b: Preserve targeted CLI test scope with suite + file
- [x] **Status:** done
- **Files:** `src/test/command-builder.ts`, `src/test/command-builder.test.ts`, `src/cli/commands/test.test.ts`
- **Acceptance:** `wp test --suite <suite> --file <path>` resolves to explicit-file Vitest commands or fails closed when the suite filter has no matching explicit files.

#### [qa] Task 1.3: Forward suite through wp_qa
- [x] **Status:** done
- **Files:** `src/mcp/tools/qa.ts`, `src/mcp/tools/qa.test.ts`
- **Acceptance:** `wp_qa` accepts `suite`, forwards it only to `wp_test`, and keeps lint/typecheck scoping unchanged.

#### [hooks] Task 1.4: Stabilize malformed-stdin SessionStart regression
- [x] **Status:** done
- **Files:** `src/hooks/sessionstart/index.test.ts`
- **Acceptance:** malformed stdin exits 0, emits valid SessionStart JSON, and keeps routing block first even if continuity context is present.

## Verification Evidence

- `wp test --file ...` targeted changed tests: passed, 149/149 tests across the touched runner/tool/hook/skill/CLI command-builder suites.
- `./bin/wp test --suite unit --file src/mcp/tools/test.test.ts --print-command`: emitted a scoped Vitest command containing only the explicit file target.
- `./bin/wp test --suite unit --file src/mcp/tools/test.test.ts`: passed.
- `wp_lint` on touched files: passed, 0 issues.
- `wp_typecheck`: passed, 0 errors.
- `wp sync --check`: in sync.
- Changeset status: `@webpresso/agent-kit` patch bump detected.
- Direct stale-surface scan: passed for `packages/gstack/skills/claude.md`, `catalog/agent/skills/claude/SKILL.md`, and `skills/claude/SKILL.md`.
- `wp_audits` package-surface + catalog-drift + blueprint-lifecycle: passed earlier in this session; not rerun after final reapply because that long audit reset the worktree.
