---
type: blueprint
status: draft
complexity: L
created: '2026-06-24'
last_updated: '2026-06-24'
progress: '95% (implemented + rebased onto main; in PR #258)'
depends_on: []
cross_repo_depends_on: []
tags: [hooks, setup, source-mode, runtime]
---

# Source-repo JIT-first hook refactor

**Goal:** Make the `@webpresso/agent-kit` source repo self-host Claude/Codex
hooks in explicit source/JIT mode (`WP_FORCE_SOURCE=1` in the emitted command
body) while keeping consumer repos on the existing direct
`node <abs>/bin/wp hook <name>` contract.

## Product wedge anchor

- **Stage outcome:** agent-kit Tier-1 host reliability
  (`catalog/agent/rules/supported-agent-clis.md`) — the dev clone must be able
  to dogfood its own hooks from source without a compiled runtime.
- **Consuming surface:** `wp setup` / `wp setup --restore-hooks` hook
  scaffolding in this repo (source) vs consumer repos; `wp hooks doctor/status`
  and `wp hooks upgrade` guidance.
- **New user-visible capability:** a maintainer running `wp setup` in the
  agent-kit clone gets hooks that fire from live source (JIT), so hook edits
  take effect without rebuilding the runtime; consumers are unaffected.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Source detection | `isAgentKitSourceRepo` (package name `@webpresso/agent-kit` + `src/cli/cli.ts`) | Cheap, deterministic, no env coupling |
| Command env prefix | `WP_FORCE_SOURCE=1 ` only in the source repo's emitted hook command | Consumers stay on the fast compiled path; source dogfoods JIT |
| JIT hook timeouts | Bump source-repo hook timeouts to >=20s | Cold source/JIT starts are slower; consumer timeouts unchanged |
| Managed wrappers | Do NOT regenerate `.codex/managed-hooks` / `.claude/hooks/managed` | Direct command form is the current contract |

### Phase 1: Source-repo hook policy [Complexity: M]

#### [backend] Task 1.1: Source-repo hook policy + scaffolding integration

**Status:** done

Add `src/cli/commands/init/source-repo-hook-policy.ts`
(`isAgentKitSourceRepo`, `hookCommandEnvPrefix`, `setupCommandForHookPolicy`)
and thread it through hook scaffolding, manifest rebuild, setup recovery, and
self-repo setup messaging.

**Files:**
- Create: `src/cli/commands/init/source-repo-hook-policy.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`,
  `src/cli/commands/init/index.ts`, `src/cli/commands/init/detect-consumer.ts`

**Acceptance:**
- [x] Source repo emits hook commands with `WP_FORCE_SOURCE=1`; consumers do not.
- [x] `.codex/managed-hooks` / `.claude/hooks/managed` are not regenerated.

#### [backend] Task 1.2: Doctor/status/upgrade source-aware guidance

**Status:** done

**Files:**
- Modify: `src/hooks/doctor.ts`, `src/hooks/status/index.ts`,
  `src/cli/commands/hooks-upgrade/index.test.ts`, docs under `docs/`

**Acceptance:**
- [x] Doctor/status/upgrade print the exact source-aware setup/repair command.
- [x] `wp dev runtime-hooks enable/disable` still toggles runtime vs JIT dispatch.

#### [qa] Task 1.3: Targeted tests + verification

**Status:** done

**Files:**
- Modify: `bin/_run.test.ts`,
  `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`,
  `src/cli/commands/init/init.integration.test.ts`,
  `src/hooks/status/index.test.ts`

**Acceptance:**
- [x] Consumer vs source command emission, stale wrapper restore, launcher
      source/runtime selection, and guidance covered.
- [x] Focused test set + `WP_FORCE_SOURCE=1 wp typecheck` green (verified after
      rebase onto main).

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `WP_FORCE_SOURCE=1 wp typecheck` | Zero errors |
| Tests | `WP_FORCE_SOURCE=1 wp test --file <focused hook set>` | All pass |
| Doctor | `WP_FORCE_SOURCE=1 wp hooks doctor --skip-mcp` | healthy |

## Non-goals

- Changing the consumer hook command contract (consumers keep the direct
  absolute command with no env prefix).

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Source/JIT cold start slower than compiled | hook latency in the dev clone | Source-repo-only timeout bump to >=20s; consumers stay on compiled runtime |
