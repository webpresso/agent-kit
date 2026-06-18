---
type: blueprint
title: "guard and MCP full output release"
owner: codex
status: completed
complexity: S
created: '2026-06-18'
last_updated: '2026-06-18'
progress: '100% (guard behavior, MCP full output, and release note verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - hooks
  - mcp
  - release
  - quality
---

# guard and MCP full output release

## Summary

Shipped a patch release slice that keeps guard control prompts host-safe, allows
lease-protected force pushes through the PreToolUse dangerous-command validator,
and adds MCP `full` output controls matching the `wp` CLI summary-first escape
hatch.

## Tasks

#### [hooks] Task 1.1: Make guard control and force-push validation precise

**Status:** done

**Depends:** None

Updated guard-switch hook output to return JSON block decisions instead of
exiting nonzero, and narrowed force-push matching so `git push --force-with-lease`
is allowed while plain `--force` and `-f` remain blocked.

**Files:**

- Modify: `src/hooks/guard-switch/index.ts`
- Modify: `src/hooks/guard-switch/index.test.ts`
- Modify: `src/hooks/pretool-guard/validators/dangerous-commands.ts`
- Modify: `src/hooks/pretool-guard/validators/dangerous-commands.test.ts`

**Acceptance:**

- [x] `guard on` and `guard off` mutate state and return host-safe JSON block decisions.
- [x] `git push --force-with-lease` variants pass validation.
- [x] Plain `git push --force` and `git push -f` remain blocked.

#### [mcp] Task 1.2: Add summary-first MCP full-output escape hatch

**Status:** done

**Depends:** None

Added a shared MCP output helper and threaded `full: true` through the summary-first
quality tools so callers can request complete raw output without truncation, while
default MCP responses remain compact.

**Files:**

- Create: `src/mcp/tools/_shared/full-output.ts`
- Modify: `src/mcp/tools/test.ts`
- Modify: `src/mcp/tools/typecheck.ts`
- Modify: `src/mcp/tools/lint.ts`
- Modify: `src/mcp/tools/format.ts`
- Modify: `src/mcp/tools/e2e.ts`
- Modify: `src/mcp/tools/qa.ts`
- Modify: matching `src/mcp/tools/*.test.ts` coverage

**Acceptance:**

- [x] `wp_test`, `wp_typecheck`, `wp_lint`, `wp_format`, and `wp_e2e` return full raw output when `full: true`.
- [x] `wp_qa` forwards `full: true` to sub-tools and preserves leaf raw output only when requested.
- [x] Default summary-first MCP responses remain bounded/truncated as before.

#### [release] Task 1.3: Satisfy release and PR gates

**Status:** done

**Depends:** Task 1.1, Task 1.2

Added the patch changeset and required release evidence references, regenerated
local managed hooks so PreCompact drift no longer blocks local guardrails, and
recorded verification evidence for the non-doc change.

**Files:**

- Create: `.changeset/host-safe-guard-switch.md`
- Create: `blueprints/completed/2026-06-18-guard-and-mcp-full-output-release.md`

**Acceptance:**

- [x] Changeset bumps `@webpresso/agent-kit` as a patch.
- [x] Changeset cites required reference-parity evidence paths.
- [x] Blueprint PR coverage has a matching completed blueprint.

## Verification

- `vp exec vitest run src/hooks/pretool-guard/validators/dangerous-commands.test.ts src/hooks/guard-switch/index.test.ts src/mcp/tools/test.test.ts src/mcp/tools/typecheck.test.ts src/mcp/tools/lint.test.ts src/mcp/tools/format.test.ts src/mcp/tools/e2e.test.ts src/mcp/tools/qa.test.ts`
- `vp run typecheck`
- `vp run changeset:status`
- `./bin/wp audit ai-contracts --root .`
- `./bin/wp audit hook-vendor-drift --root .`
