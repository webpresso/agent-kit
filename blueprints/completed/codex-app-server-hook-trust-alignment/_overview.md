---
type: blueprint
status: completed
completed_at: '2026-05-14'
complexity: M
created: 2026-05-14T00:00:00.000Z
last_updated: '2026-05-14'
progress: '100% (6/6 tasks done, 0 blocked, updated 2026-05-14)'
depends_on: []
tags:
  - codex
  - hooks
  - app-server
  - infra
---

# Codex App-server Hook Trust Alignment

**Goal:** Replace agent-kit's Codex hook auto-trust implementation with a clean official-runtime path that asks the installed `codex app-server` for hook `key`/`currentHash`, writes trust state through `config/batchWrite`, and deletes the manual hash-mirroring implementation. If app-server trust sync cannot run, setup must fail loudly or warn explicitly without pretending hooks are trusted.

**Research source:** `docs/research/2026-05-14-codex-official-types-hook-trust-alignment.md`

## Planning Summary

- Goal input: Align agent-kit hook trust automation to official Codex types/runtime behavior and public OpenAI repo surfaces.
- Complexity: M
- Draft slug: `codex-app-server-hook-trust-alignment`
- Output path: `blueprints/draft/codex-app-server-hook-trust-alignment/_overview.md`
- Validation scope: preserve current `wp setup` behavior while reducing reliance on Codex private hash internals.
- Refinement scope: fact-check OpenAI/Codex app-server claims, verify local file paths and command surfaces, harden concurrency/error cases, and restructure tasks for `/pll` conflict safety.
- Execution principle: app-server is authoritative; remove manual hash mirroring rather than preserving it as a compatibility path. Fail loudly with actionable diagnostics when official trust sync is unavailable.

## Architecture Overview

```text
wp setup / codex hook scaffolder
        |
        v
write .codex/hooks.json / user hook config
        |
        v
CodexAppServerClient  ---- initialize/initialized ----> codex app-server --listen stdio://
        |                                                   |
        |---- hooks/list(cwds=[repoRoot]) ------------------>|
        |<--- HookMetadata{key,currentHash,sourcePath,...} --|
        |
        v
filter agent-kit-owned unmanaged hooks
        |
        v
config/batchWrite hooks.state.{key}.{enabled,trusted_hash}
        |
        v
hooks/list verification; otherwise explicit setup diagnostic and untrusted hooks remain reviewable in /hooks
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Trust identity source | Prefer installed `codex app-server` `hooks/list` (F1-F4) | Official runtime computes `key`, `currentHash`, and `trustStatus`; avoids cloning upstream internals. |
| Type source | Generate/vendor minimal app-server protocol types from installed Codex or pinned `openai/codex` source (F8-F10) | `@openai/codex` npm package does not currently ship protocol TS types, and docs.rs crate metadata is not official OpenAI. |
| Runtime validation | Use local `zod` wire schemas for consumed response shapes (F7) | Generated TS may contain `bigint` fields while JSON wire values are numbers; boundary validation must match actual JSON. |
| Legacy removal | Delete existing manual hash path after app-server sync is wired (F5, F12, L1) | Avoids carrying brittle Codex-internal hash mirroring and forces official-runtime alignment. |
| Dependency policy | No new runtime dependency unless already justified | Existing stack already has `zod`, `yaml`, and CLI process tooling. |
| Ownership boundary | Trust only agent-kit-owned unmanaged command hooks from expected source paths (F6) | Prevents auto-trusting arbitrary user/project hooks. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS-S |
| **Wave 1** | 2.1 | 1.1, 1.2 | 1 agent | S |
| **Wave 2** | 2.2 | 2.1 | 1 agent | S-M |
| **Wave 3** | 3.1, 3.2 | 2.2 | 2 agents | XS-S |
| **Critical path** | 1.1 -> 2.1 -> 2.2 -> 3.1 | -- | 4 waves | M |

## Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 6/4 = 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 6/6 = 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** C. The no-legacy target deliberately keeps a narrow critical path: app-server boundary -> trust sync -> scaffolder replacement -> deletion/contract verification. Do not preserve manual legacy path just to increase parallelism.

## Fact-Check Findings

| ID | Severity | Claim | Reality | Blueprint Fix |
| -- | -------- | ----- | ------- | ------------- |
| F1 | LOW | `codex app-server generate-ts --out DIR` exists in local Codex CLI 0.130.0. | Verified via `codex app-server generate-ts --help`; command is marked experimental. | Keep type generation as dev/test aid, not runtime dependency. |
| F2 | LOW | `hooks/list` is available after `initialize`/`initialized`. | Verified in OpenAI app-server docs and README: clients initialize first, then call methods. | Task 1.1 requires handshake tests before other requests. |
| F3 | LOW | `hooks/list` returns hook `key`, `currentHash`, `trustStatus`, `sourcePath`, `enabled`, and `isManaged`. | Verified in official README example and `HookMetadata` protocol source. | Task 1.1 schemas include only consumed fields; Task 2.1 verifies trusted/enabled after write. |
| F4 | LOW | `config/batchWrite` can upsert `hooks.state` and hot-reload user config. | Verified in protocol source: `ConfigEdit` has `keyPath`, `value`, `mergeStrategy`; params include `reloadUserConfig`. | Task 2.1 uses `mergeStrategy: "upsert"` and `reloadUserConfig: true`. |
| F5 | HIGH | Hook state should be written with `trusted_hash`. | Verified in `codex-rs/config/src/hook_config.rs`: state fields are `enabled` and `trusted_hash`. | Task 2.1 and tests assert snake_case `trusted_hash`, not `trustedHash`. |
| F6 | HIGH | It is safe to trust all hooks in `.codex/hooks.json`. | False. User-authored project hooks may share the same file. | Task 1.2 adds a strict agent-kit ownership predicate by source path, command/bin, handler type, and unmanaged status. |
| F7 | MEDIUM | Generated TS types can be consumed blindly as JSON wire types. | Risky. Generated `HookMetadata.ts` represents `timeoutSec`/`displayOrder` as `bigint`, while README/runtime JSON examples use numeric JSON values. | Task 1.1 uses `zod` wire schemas accepting safe integers and treats generated TS as reference-only. |
| F8 | MEDIUM | `@openai/codex` npm provides protocol TS types. | False for 0.130.0 tarball; it contains CLI bin/support files, not app-server protocol declarations. | Type strategy remains generated/vendor pinned subset, not npm import. |
| F9 | MEDIUM | docs.rs `codex-app-server-protocol` is official OpenAI. | False/unsafe. Crates metadata points at `namastexlabs/codex`, not `openai/codex`. | Non-goal forbids runtime dependence on that crate; docs task repeats caveat. |
| F10 | MEDIUM | Hook keys can be computed or cached long-term. | Risky. Official README/source say keys include a currently positional event/group/handler selector. | Task 2.1 always uses fresh `hooks/list`; never guesses app-server keys. |
| F11 | MEDIUM | App-server failures are rare enough to ignore. | Unsafe for setup UX. Missing `codex`, protocol drift, hanging process, or stderr-only failure can happen. | Task 1.1 adds timeout/error context; Task 2.1 returns structured failure reasons. |
| F12 | HIGH | Existing manual hash path is fully future-proof. | False. Local Codex 0.130.0 matches now, but it mirrors upstream internals. | Delete manual hash mirroring after app-server sync is wired; tests prove no `trusted_hash` is computed locally. |

## Codebase Verification Findings

| ID | Severity | Finding | Evidence | Blueprint Fix |
| -- | -------- | ------- | -------- | ------------- |
| C1 | LOW | Current hook scaffolder lives in `src/cli/commands/init/scaffolders/agent-hooks/index.ts`. | Verified; it currently owns `.claude/settings.json`, `.codex/hooks.json`, manual trust hash writes, and `trustCodexAgentKitHooksForRepo`. | Tasks isolate new modules before touching `index.ts`, then remove manual trust hash code from it. |
| C2 | LOW | Existing generated Codex commands include six bins. | Verified in `TRUSTED_AGENT_KIT_CODEX_BINS` and `buildAgentKitHookGroups`: `ak-sessionstart-routing`, `ak-check-dev-link`, `ak-pretool-guard`, `ak-post-tool`, `ak-guard-switch`, `ak-stop-qa`. | Task 1.2 acceptance uses this exact set. |
| C3 | MEDIUM | The repo has no `src/codex/` directory today. | Verified with filesystem search. | Task 1.1 creates `src/codex/app-server/` as the new boundary. |
| C4 | LOW | Scoped `wp lint` file args are supported. | Verified via `wp lint --help`. | Verification gates keep scoped lint commands. |
| C5 | MEDIUM | `src/cli/commands/init/index.ts` reapplies hook trust after OMX setup. | Verified; this reapplication must survive migration. | Task 2.2 explicitly wires app-server trust sync into both initial scaffold and post-OMX reapply path. |
| C6 | LOW | `docs/hook-matrix.md` is the nearest Codex hook guarantee doc. | Verified. | Task 3.2 updates it and setup docs. |
| L1 | HIGH | Keep failure path for compatibility. | Rejected by current product directive: do not leave legacy manual hash code. | Blueprint removes failure path tasks and adds deletion acceptance checks. |

## Phases

### Phase 1: Independent boundaries and predicates [Complexity: S]

#### [infra] Task 1.1: Add Codex app-server wire schemas and protocol types

**Status:** done

**Depends:** None

Create the minimal app-server protocol boundary used by agent-kit. This task defines local TypeScript types and `zod` schemas for the actual JSON wire payloads, not a broad Codex SDK. Include a comment that generated OpenAI TS types are reference material only because fields such as `timeoutSec` and `displayOrder` may appear as `bigint` in generated types while JSON transport values are numbers (F7).

**Files:**

- Create: `src/codex/app-server/types.ts`
- Create: `src/codex/app-server/types.test.ts`

**Steps (TDD):**

1. Write failing schema tests for a `hooks/list` response containing `key`, `eventName`, `handlerType`, `matcher`, `command`, `timeoutSec`, `sourcePath`, `source`, `enabled`, `isManaged`, `currentHash`, and `trustStatus`.
2. Include a regression test that `timeoutSec` and `displayOrder` parse from JSON numbers, not `bigint` literals.
3. Add schemas/types for `HooksListResponse`, `HookMetadata`, `ConfigBatchWriteParams`, `ConfigBatchWriteResponse` minimal shape, and JSON-RPC error shape.
4. Export a narrow `CodexAppServerApi` interface with `hooksList(cwds: string[])`, `configBatchWrite(params)`, and `close()` so downstream tasks can depend on an interface instead of a concrete process client.
5. Run: `bun run test src/codex/app-server/types.test.ts --reporter=dot` — verify PASS.

**Acceptance:**

- [x] Wire schemas accept official README-style hook metadata JSON.
- [x] Wire schemas reject missing `key`, missing `currentHash`, invalid `trustStatus`, and non-command hooks when parsed by the command-hook helper.
- [x] Numeric `timeoutSec`/`displayOrder` are accepted as safe integers.
- [x] No new runtime dependency is added.
- [x] Source comments cite official app-server docs/repo URLs for future verification.
#### [infra] Task 1.2: Add agent-kit Codex hook ownership predicate

**Status:** done

**Depends:** None

Extract hook ownership filtering into a pure module. The predicate must accept only agent-kit-owned unmanaged command hooks discovered by app-server from expected source paths. It must reject arbitrary user hooks, managed hooks, non-command handlers, plugin hooks, unrelated source paths, and shell commands that merely contain similar text but do not resolve to the known `ak-*` bin names.

**Files:**

- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-ownership.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-ownership.test.ts`

**Steps (TDD):**

1. Write acceptance tests for the six current agent-kit Codex bins: `ak-sessionstart-routing`, `ak-check-dev-link`, `ak-pretool-guard`, `ak-post-tool`, `ak-guard-switch`, and `ak-stop-qa`.
2. Write rejection tests for arbitrary Bash/Python hooks, `isManaged: true`, `handlerType !== "command"`, `pluginId !== null`, unrelated `sourcePath`, missing `command`, and commands that do not target `node_modules/.bin/<known-ak-bin>`.
3. Implement `isAgentKitOwnedCodexHook(metadata, expectedSourcePaths)` and a helper that normalizes expected project/user hook source paths.
4. Run: `bun run test src/cli/commands/init/scaffolders/agent-hooks/codex-ownership.test.ts --reporter=dot` — verify PASS.

**Acceptance:**

- [x] Predicate accepts only agent-kit-generated unmanaged command hooks.
- [x] Predicate checks source path, handler type, managed status, plugin id, and command/bin identity.
- [x] Predicate does not trust user-authored hooks in the same repo unless they are exact agent-kit bin entries from expected hook source files.
- [x] No existing hook generation behavior changes in this task.
### Phase 2: Official-runtime trust sync [Complexity: M]

#### [backend] Task 2.1: Add minimal Codex app-server JSONL client and trust-sync planner

**Status:** done

**Depends:** Task 1.1, Task 1.2

Implement the concrete app-server process client and a pure trust-sync planner. The client spawns `codex app-server --listen stdio://`, sends `initialize` with `clientInfo.name = "webpresso_agent_kit"`, sends the `initialized` notification, then supports only `hooks/list` and `config/batchWrite`. The planner takes discovered hooks, filters through Task 1.2 ownership, and builds the `hooks.state` upsert payload using snake_case `trusted_hash` (F5). Keep process I/O code separate from the pure planner so tests can use fake clients. Do not call or import the old manual hash builder.

**Files:**

- Create: `src/codex/app-server/client.ts`
- Create: `src/codex/app-server/client.test.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.test.ts`

**Steps (TDD):**

1. Write fake-stream client tests: initialize request is sent first, `initialized` notification follows, and later responses resolve by matching `id`.
2. Add timeout/error tests for invalid JSON, JSON-RPC error responses, closed stdout, and child exit before response; diagnostics must include method and stderr tail.
3. Write pure planner tests proving `hooks/list` -> ownership filter -> `config/batchWrite` payload contains `{ enabled: true, trusted_hash: currentHash }` under each official key.
4. Implement `CodexAppServerClient` and `syncCodexHookTrustWithAppServer(api, input)` using the `CodexAppServerApi` interface from Task 1.1.
5. Add a verification test that a second `hooks/list` returning non-`trusted` or disabled hooks produces a structured failure reason and no local trust write.
6. Run: `bun run test src/codex/app-server/client.test.ts src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.test.ts --reporter=dot` — verify PASS.

**Acceptance:**

- [x] Client sends initialize/initialized before other requests.
- [x] Client handles JSONL response correlation by request id.
- [x] Client validates app-server responses with local schemas from Task 1.1.
- [x] Trust sync writes only official `key` + `currentHash` values from `hooks/list`.
- [x] Trust sync writes snake_case `trusted_hash` and `enabled: true`.
- [x] Failures return structured reasons and never silently trust nothing.
#### [backend] Task 2.2: Replace manual trust writes with app-server trust sync

**Status:** done

**Depends:** Task 2.1

Replace the current trust flow in `scaffoldAgentHooks` and `trustCodexAgentKitHooksForRepo` with app-server trust sync and delete local manual hash computation/upsert code. Preserve non-interactive setup. If app-server is unavailable, unsupported, times out, or verification fails, emit a visible actionable diagnostic and leave hooks for `/hooks` review; do not compute or write local mirrored hashes. Preserve the existing post-OMX reapply behavior in `src/cli/commands/init/index.ts` because OMX can clear duplicate `[hooks.state]` blocks before agent-kit rehydrates its own hooks.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `src/cli/commands/init/index.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-app-server-trust.integration.test.ts`

**Steps (TDD):**

1. Add tests with a fake `CodexAppServerApi` proving app-server sync is invoked after `.codex/hooks.json` exists.
2. Assert no trust write occurs when no agent-kit-owned hooks are discovered.
3. Assert app-server failure emits/returns a structured warning and does not invoke manual hash computation.
4. Assert dry-run still avoids config writes and process spawning.
5. Delete `codexCommandHookHash`, `versionForCodexTomlIdentity`, `upsertCodexHookTrustStates`, and related local hash/upsert helpers from `index.ts` or any extracted module.
6. Preserve the post-OMX reapply call path in `src/cli/commands/init/index.ts`.
7. Run: `bun run test src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/scaffolders/agent-hooks/codex-app-server-trust.integration.test.ts --reporter=dot` — verify PASS.

**Acceptance:**

- [x] No manual hash path remains.
- [x] Existing `wp setup` remains non-interactive.
- [x] Dry-run never spawns `codex app-server` or writes `$CODEX_HOME/config.toml`.
- [x] Post-OMX reapply still runs and uses the same app-server-first behavior.
- [x] Failure warnings are concise and actionable and direct users to `/hooks` review.
### Phase 3: Contract checks and docs [Complexity: S]

#### [qa] Task 3.1: Add no-legacy contract checks for app-server trust sync

**Status:** done

**Depends:** Task 2.2

Add contract and static checks that prove agent-kit no longer computes Codex hook hashes locally. The optional Codex contract uses an isolated temp repo and temporary `CODEX_HOME`, writes agent-kit-style hooks, runs local app-server `hooks/list`, applies app-server trust sync, and verifies target hooks become trusted without touching real user config. Normal CI must skip the live Codex test by default with a clear reason.

**Files:**

- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-contract.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` only if shared helpers need export/import changes
- Modify: `package.json` only if an optional script is needed, for example `test:codex-contract`
- Add static assertions in the most appropriate hook test file that removed helper names are absent from source

**Steps (TDD):**

1. Add a skipped-by-default live test gated by `WP_CODEX_CONTRACT=1` and `codex --version` availability.
2. Use temp directories for repo root and `CODEX_HOME`; never touch the user's real Codex config.
3. Generate/write agent-kit hook config, run app-server trust sync, and verify app-server `hooks/list` reports agent-kit hooks as trusted/enabled.
4. Add static assertions that source no longer contains `codexCommandHookHash`, `versionForCodexTomlIdentity`, or `upsertCodexHookTrustStates`.
5. Assert skipped output includes the reason when the env var or `codex` binary is missing.
6. Run normal scoped tests to prove this file does not make CI require Codex.
7. Run optional contract locally when Codex is present: `WP_CODEX_CONTRACT=1 bun run test src/cli/commands/init/scaffolders/agent-hooks/codex-contract.test.ts --reporter=dot`.

**Acceptance:**

- [x] Normal CI/test runs skip contract checks without failure.
- [x] Contract test never reads or writes real user `$CODEX_HOME`.
- [x] Contract test proves app-server trust sync can trust all current agent-kit Codex bins.
- [x] Static checks prove manual hash helpers were deleted, not renamed into a failure path module.
#### [docs] Task 3.2: Document trust sync behavior and operational caveats

**Status:** done

**Depends:** Task 2.2

Update docs so users and future agents understand why hook trust is auto-synced, what official surfaces are used, and what happens when app-server is unavailable. Include the fact-check caveat that docs.rs `codex-app-server-protocol` is not the official source. State clearly that agent-kit does not auto-trust arbitrary user-authored hooks.

**Files:**

- Modify: `docs/hook-matrix.md`
- Modify: `docs/getting-started.md` or `docs/presets.md`, whichever is the closest setup/troubleshooting surface after inspecting existing text
- Modify: `docs/research/2026-05-14-codex-official-types-hook-trust-alignment.md` only if implementation findings invalidate the recommendation

**Steps (TDD):**

1. Add concise setup docs for app-server-derived trust sync.
2. Add caveat: user-authored hooks are not auto-trusted by agent-kit.
3. Add troubleshooting notes for missing `codex`, app-server failure, failure warnings, and manual `/hooks` inspection.
4. Run: `bun run lint docs/hook-matrix.md docs/getting-started.md docs/presets.md` for touched docs.
5. Run docs checks if affected frontmatter/link rules require it: `bun run docs:check`.

**Acceptance:**

- [x] Docs explain app-server `hooks/list` + `config/batchWrite` at a high level.
- [x] Docs state only agent-kit-owned hooks are auto-trusted.
- [x] Docs include failure-mode caveat and how to inspect `/hooks` manually.
- [x] Docs do not claim docs.rs `codex-app-server-protocol` is official OpenAI distribution.
- [x] Docs checks pass or any pre-existing unrelated failures are recorded.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Scoped app-server tests | `bun run test src/codex/app-server --reporter=dot` | App-server boundary tests pass |
| Scoped hook tests | `bun run test src/cli/commands/init/scaffolders/agent-hooks --reporter=dot` | Hook scaffolder/trust tests pass |
| Type safety | `bun run typecheck` | Zero errors |
| Scoped lint | `bun run lint src/codex/app-server src/cli/commands/init/scaffolders/agent-hooks` | Zero violations |
| Optional Codex contract | `WP_CODEX_CONTRACT=1 bun run test src/cli/commands/init/scaffolders/agent-hooks/codex-contract.test.ts --reporter=dot` | Passes when local Codex is installed; otherwise intentionally skipped outside contract mode |
| Manual smoke | Run `wp setup` in a temp repo with temporary `CODEX_HOME`; inspect `codex app-server hooks/list` or `/hooks` state | Agent-kit hooks are trusted/enabled; user hooks remain untrusted |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Upstream | None | -- |
| Downstream | `docs/research/2026-05-14-codex-official-types-hook-trust-alignment.md` | Research source; update only if implementation disproves the recommendation. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| `codex` binary missing (F11) | Setup cannot use official runtime metadata | Emit explicit warning/failure; leave hooks untrusted for `/hooks` review rather than writing guessed hashes | 2.2, 3.1 |
| App-server protocol changes (F7/F11) | Client fails or writes wrong shape | `zod` validation and method-specific errors; no silent trust write | 1.1, 2.1 |
| App-server hangs (F11) | `wp setup` stalls | Client timeout and explicit diagnostic | 2.1, 2.2 |
| Hook key positional suffix changes (F10) | Stale guessed keys fail | Never guess keys; always read from `hooks/list` | 2.1 |
| User-authored project hook present (F6) | Accidental trust of unsafe hook | Strict ownership predicate by source path + command/bin + unmanaged status | 1.2, 2.1 |
| Multiple config layers produce duplicate commands (C5) | Wrong source trusted | Filter by expected source path and hook ownership; verify after write | 1.2, 2.1 |
| `config/batchWrite` writes user config by default (F4) | Project config not updated | Desired: hook trust is user state; document behavior | 2.1, 3.2 |
| OMX clears duplicate trust state before rehydration (C5) | Agent-kit trust entries disappear after setup | Preserve post-OMX reapply path with app-server-first sync | 2.2 |
| Generated TS declares `bigint` while JSON is numeric (F7) | Type/runtime mismatch | Use wire schemas and treat generated TS as reference only | 1.1 |

## Non-goals

- Do not auto-trust arbitrary user-authored hooks.
- Do not implement a broad Codex app-server SDK.
- Do not depend on GitHub `main`, npm package internals, or the docs.rs `codex-app-server-protocol` crate at runtime.
- Do not keep manual Codex hook hash mirroring after app-server trust sync lands.
- Do not change hook command semantics beyond trust-state synchronization.
- Do not claim Codex `MultiEdit` hook parity.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| App-server methods or generated protocol remain experimental (F1/F11) | Medium | Use stdio only, tiny method subset, validation, and explicit failure diagnostics. |
| Trust sync could be perceived as bypassing review (F6) | Medium | Restrict to agent-kit-owned deterministic hooks; document that user hooks remain manual. |
| Reintroducing manual hash mirroring (F12/L1) | High | Static no-legacy assertions and review checklist reject local Codex hash computation. |
| Generated type mismatch causes implementation confusion (F7) | Medium | Name schemas as JSON wire schemas; add regression tests for number fields. |
| Setup output becomes noisy | Low | Show concise warning only on failure; keep success quiet or one-line. |
| Temporary CODEX_HOME tests are flaky | Medium | Use isolated temp dirs, deterministic hooks, optional contract gating. |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| App-server transport | JSONL over stdio | Installed local Codex | Official local integration path; avoids unsupported WebSocket mode. |
| Runtime validation | `zod` | Existing dependency | Fail loudly on protocol drift without adding dependency. |
| Type reference | Generated/pinned TS subset from `codex app-server generate-ts` or `openai/codex` source | Pin to supported Codex version/commit | Official reference without runtime GitHub dependency; do not blindly use bigint wire types. |
| Legacy hash mirroring | Deleted | N/A | Official app-server is the only trust identity source; failures remain reviewable via `/hooks`. |
| Test runner | Vitest through `bun run test` | Existing repo script | Matches current repository convention. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 19 (12 technology, 6 codebase, 1 product directive) |
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 7 |
| Fixes applied | 19/19 in blueprint text |
| Cross-plans updated | 0 |
| Edge cases documented | 9 |
| Risks documented | 6 |
| Parallelization score | C (2 tasks in Wave 0, conflict pressure 0; no-legacy sequencing preserved) |
| Critical path | 4 waves |
| Max parallel agents | 2 |
| Total tasks | 6 |
| Blueprint compliant | 6/6 |
