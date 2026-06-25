---
type: blueprint
status: draft
complexity: M
created: "2026-06-24"
last_updated: "2026-06-24"
progress: "100% (codex event drift + claude type pin + workflow landed)"
depends_on: []
cross_repo_depends_on: []
tags: [hooks, contract, drift, ci, codex, claude]
---

# Scheduled hook contract drift detection

**Goal:** Detect when the upstream Codex / Claude hook contracts drift from what
agent-kit emits and expects — without making an upstream vendor version bump able
to turn required CI red. Runs on a schedule, never as a required PR check.

## Product wedge anchor

- **Stage outcome:** agent-kit Tier-1 host reliability
  (`catalog/agent/rules/supported-agent-clis.md`) — Codex + Claude Code are the
  Tier-1 hosts; their hook contracts are load-bearing.
- **Consuming surface:** the scheduled `hook-contract-drift` workflow + the
  committed golden/assertion that maintainers review when it fires.
- **New user-visible capability:** maintainers learn about an upstream hook
  contract change (new/renamed event, dropped decision value) as a reviewable
  signal, instead of discovering it when a consumer's hooks silently misbehave.

## Research basis (2026-06-24, source-backed)

- **Codex** (`codex-cli` 0.142.0): `codex app-server generate-json-schema --out
  <dir>` emits the JSON-RPC app-server protocol, **not** the per-hook command
  stdin/stdout contract — `permissionDecision`/`hookSpecificOutput` appear
  nowhere. The authoritative hook-event list lives in
  `v2/HooksListResponse.json → definitions.HookEventName.enum` (10 camelCase
  events). Confirmed against `openai/codex` `hook_runtime.rs`. `timeoutSec` was
  removed in favour of `timeout` (PR #18893).
- **Claude** (`@anthropic-ai/claude-agent-sdk` 0.3.190): exports `HookInput`,
  `PreToolUseHookInput`, `SyncHookJSONOutput`, and
  `HookPermissionDecision = 'allow'|'deny'|'ask'|'defer'` (note: `defer` is new
  in 2026; Codex does NOT support it). Stdin is snake_case
  (`tool_name`/`tool_input`/`hook_event_name`). A type-only `import type`
  assertion is viable; installing the SDK pulls unused optional native binaries.

## Key Decisions

| Decision                  | Choice                                                                                | Rationale                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex drift signal        | Diff the `HookEventName` enum from `generate-json-schema` against a checked-in golden | It is the only machine-generatable, authoritative hook surface; the command I/O schema is doc-sourced and pinned separately by `codex-contract.test.ts`                                        |
| Claude drift signal       | Type-only `tsc` assertion vs `@anthropic-ai/claude-agent-sdk` published types         | The SDK ships `.d.ts`; assignability of our deny envelope + decision value is a precise compile-time pin                                                                                       |
| Required vs scheduled     | Scheduled workflow only (cron + dispatch); never a required PR check                  | An upstream vendor version bump must not be able to red the required gate (`no-timeout-as-fix` spirit: the drift is a signal, not a build break)                                               |
| SDK as devDep?            | NO — installed ephemerally in the job                                                 | Avoids a heavy optional-binary dep + lockfile churn in every install; the assertion file lives under `scripts/` (outside `tsconfig include: src/**`) so required `wp typecheck` never needs it |
| Drift script failure mode | `skipped` (exit 0) when `codex` is unavailable; `drift` (exit 1) only on real change  | The scheduled job stays green unless the contract actually moved                                                                                                                               |

### Phase 1: Codex hook-event drift [Complexity: S]

#### [qa] Task 1.1: Codex HookEventName drift detector

**Status:** done

**Files:**

- Create: `scripts/contract/codex-hook-event-drift.ts` (pure `extractCodexHookEventNames`/`diffEventNames` + `runCodexHookEventDrift` runner)
- Create: `scripts/contract/codex-hook-event-drift.test.ts`
- Create: `scripts/contract/codex-hook-event-names.golden.json` (10 events, codex 0.142.0)

**Acceptance:**

- [x] Pure extract throws on missing/empty/non-string enum; diff is order-independent.
- [x] Golden matches codex 0.142.0; runner reports `IN SYNC (10 events)` locally.
- [x] Runner bounds the `codex` subprocess (60s deadline) and degrades to
      `skipped` when codex is absent (no required-gate dependency on the tool).
- [x] Unit test green; `wp lint` clean.

### Phase 2: Claude contract type pin [Complexity: S]

#### [qa] Task 2.1: Type-only Claude hook contract assertion

**Status:** done

**Files:**

- Create: `scripts/contract/claude-hook-contract.assert.ts` (compile-only `import type`)
- Create: `scripts/contract/tsconfig.claude-contract.json` (standalone)

**Acceptance:**

- [x] Asserts our deny envelope is assignable to `SyncHookJSONOutput`, `'deny'`
      is a member of `HookPermissionDecision`, and `PreToolUseHookInput` snake_case
      fields exist.
- [x] Verified to compile against the real `@anthropic-ai/claude-agent-sdk`
      0.3.190 (`tsc --noEmit` exit 0).
- [x] Outside `tsconfig include: ["src/**"]`, so required `wp typecheck` stays
      green without the SDK installed (confirmed).

### Phase 3: Scheduled workflow [Complexity: S]

#### [infra] Task 3.1: Non-required scheduled workflow

**Status:** done

**Files:**

- Create: `.github/workflows/hook-contract-drift.yml`

**Acceptance:**

- [x] `schedule` (weekly cron) + `workflow_dispatch`; does NOT run on
      `pull_request`, so it is never a required check.
- [x] Job 1 installs codex best-effort and runs the event-drift script.
- [x] Job 2 ephemerally installs the SDK + tsc and typechecks the assertion.

## Verification Gates

| Gate               | Command                                                                 | Success Criteria                         | Last result |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------- | ----------- |
| Type safety        | `wp typecheck`                                                          | Zero errors (scripts excluded by design) | pass        |
| Tests              | `wp test --file scripts/contract/codex-hook-event-drift.test.ts`        | All pass                                 | pass        |
| Live codex drift   | `bun scripts/contract/codex-hook-event-drift.ts`                        | `IN SYNC (10 events)`                    | pass        |
| Claude SDK compile | `tsc -p scripts/contract/tsconfig.claude-contract.json` (SDK installed) | exit 0                                   | pass        |
| Lint               | `wp lint --file <changed>`                                              | Zero violations                          | pass        |

## Non-goals

- Making either check a required PR gate (the required pins are
  `codex-contract.test.ts` for the Codex command schema and the conformance
  boundary suite for decisions).
- Validating the Codex per-hook command I/O schema via `generate-json-schema`
  (it does not emit that surface — confirmed).
- Adding `@anthropic-ai/claude-agent-sdk` as a committed dependency.

## Risks

| Risk                                                | Impact                      | Mitigation                                                                 |
| --------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `codex` CLI not installable in CI                   | event-drift job can't check | Script degrades to `skipped` (exit 0); install step is `continue-on-error` |
| SDK install pulls native optional binaries          | slower job                  | Ephemeral `--no-save`, type-only use; never touches required CI            |
| Golden goes stale after an intentional Codex change | false drift alert           | Drift output names added/removed events and points at the golden to update |
