---
type: blueprint
title: Secret-aware Worker Tail and CI Act MCP completion
status: completed
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
complexity: M
created: '2026-05-23'
last_updated: '2026-05-27'
progress: '100% (5/5 tasks done, 0 blocked, updated 2026-05-27)'
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/framework
    slug: public-secret-surface-hard-cut
    require_status: completed
aligned_blueprints:
  - planned/agent-kit-cli-bundle-cutover
  - planned/agent-kit-public-release-scrub
  - >-
    in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso
  - planned/mcp-first-secret-surface-hard-cut-roadmap
tags:
  - mcp
  - wrangler
  - cloudflare
  - secrets
  - ci
  - hooks
parent_roadmap: planned/mcp-first-secret-surface-hard-cut-roadmap
completed_at: '2026-05-27'
---

# Secret-aware Worker Tail and CI Act MCP completion

## Product wedge anchor

The core `wp_worker_tail`, `wp_ci_act`, and `wp_*` routing surfaces already
exist, and this blueprint now tracks the remaining completion lane only:
stabilize the public helper/export contract, tighten agent routing around the
existing tools, and keep downstream adopters aligned on the shipped surface.

## Summary

Verified on 2026-05-26:

- `src/mcp/tools/worker-tail.ts` exists and registers `wp_worker_tail`.
- `src/mcp/tools/ci-act.ts` exists and registers `wp_ci_act`.
- `src/mcp/tools/test.ts`, `typecheck.ts`, `lint.ts`, `qa.ts`, and `audit.ts`
  register the canonical `wp_*` verification names.
- `src/cli/commands/config.ts` already ships `wp config secrets set|show|status|setup`.
- The remaining upstream gap is in `framework`, where public secret legacy still
  exists.
- The previous blueprint also mixed in blueprint-authoring tasks, which now
  live in `draft/blueprint-authoring-surface-hardening`.
- This lane preserves canonical MCP `wp_*` tool names. It does not decide
  durable public CLI command ownership; current `wp ...` CLI examples are
  migration-era/current-state examples, and future unified command ownership is
  owned by `planned/agent-kit-cli-bundle-cutover`.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Public verification names | Keep `wp_*` as canonical | These are the real tool names currently registered in MCP. |
| Public CLI boundary | Treat `wp_*` as MCP/tool names, not durable public CLI branding | Public command branding is governed by `planned/agent-kit-cli-bundle-cutover`; CLI examples using `wp ...` are current-state/migration-only unless explicitly MCP tool names. Future unified CLI ownership belongs to `webpresso ...`. |
| Upstream dependency | Depend on `framework` hard-cut cleanup | Agent-kit should consume the finished public secret contract, not re-define it. |
| Runtime package boundary | Remove the direct `@webpresso/webpresso` runtime dependency once the secret contract is host-neutral | Agent-kit should own agent surfaces and MCP helpers without depending on the framework/runtime package for `wp config secrets ...`. |
| Child scope | CI/tail/helper/routing only | Keeps unrelated blueprint-authoring work out of the execution lane. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | Framework `public-secret-surface-hard-cut` delivered, or local adapter ownership explicitly chosen | 2 agents | S-M |
| **Wave 1** | 1.3, 1.4 | 1.1, 1.2 | 2 agents | S-M |
| **Wave 2** | 1.5 | 1.3, 1.4 | 1 agent | S |
| **Critical path** | 1.1 → 1.4 → 1.5 | — | 3 waves | M |

**Start condition:** Do not begin Tasks 1.1 or 1.2 until the framework public
secret contract is available, unless this blueprint is intentionally revised to
make agent-kit own the minimal host-neutral adapter.

#### Task 1.1: [mcp] Stabilize `wp_ci_act` against the finalized public secret contract

**Status:** done

**Depends:** Cross-repo framework `public-secret-surface-hard-cut` delivered, or an explicitly documented agent-kit-owned minimal adapter decision

Update the existing `wp_ci_act` tool and CLI command surfaces so they consume
the finalized public secret contract from `framework` without carrying stale
assumptions about provider-specific fallbacks or new helper creation.

**Files:**

- Modify: `src/mcp/tools/ci-act.ts`
- Modify: `src/mcp/tools/ci-act.test.ts`
- Modify: `src/cli/commands/ci.ts`

**Steps (TDD):**

1. Add failing tests that capture the expected post-hard-cut secret resolution
   path for `wp_ci_act`.
2. Run: `wp_test({\"files\":[\"src/mcp/tools/ci-act.test.ts\"]})` — verify FAIL.
3. Update the tool and CLI surface to consume only the canonical public secret
   contract.
4. Run: `wp_test({\"files\":[\"src/mcp/tools/ci-act.test.ts\"]})` — verify PASS.
5. Run: `wp_typecheck({})`.

**Acceptance:**

- [x] `wp_ci_act` no longer relies on stale secret-contract assumptions
- [x] CLI and MCP flows agree on the same helper/secret path
- [x] `wp_typecheck` passes
#### Task 1.2: [mcp] Stabilize `wp_worker_tail` and shared secret-gated execution helpers

**Status:** done

**Depends:** Cross-repo framework `public-secret-surface-hard-cut` delivered, or an explicitly documented agent-kit-owned minimal adapter decision

Refresh the existing worker-tail lane so it uses the same finalized secret-gate
contract and bounded execution expectations as the CI act lane. The output
envelope stays compact and agent-safe.

**Files:**

- Modify: `src/mcp/tools/worker-tail.ts`
- Modify: `src/mcp/tools/worker-tail.test.ts`
- Modify: `src/secret-gate/runner.ts`

**Steps (TDD):**

1. Add failing tests for the finalized shared secret-gate behavior used by
   worker tail.
2. Run: `wp_test({\"files\":[\"src/mcp/tools/worker-tail.test.ts\"]})` — verify FAIL.
3. Update the tool and shared helper for the finalized contract.
4. Run: `wp_test({\"files\":[\"src/mcp/tools/worker-tail.test.ts\"]})` — verify PASS.
5. Run: `wp_typecheck({})`.

**Acceptance:**

- [x] `wp_worker_tail` uses the finalized shared secret-gate contract
- [x] Shared helper expectations match the CI act lane
- [x] `wp_typecheck` passes
#### Task 1.3: [hooks] Tighten pretool routing and guidance to the real `wp_*` names

**Status:** done

**Depends:** Task 1.1, Task 1.2

Update hook guidance and routing coverage so shell-first verification commands
are redirected toward the shipped `wp_*` tools, not legacy MCP aliases or raw
package-manager entrypoints.

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Add failing routing tests for legacy MCP-alias guidance and shell verification
   paths.
2. Run the focused hook/integration tests — verify FAIL.
3. Update the routing/guidance strings to the real `wp_*` surface.
4. Re-run the focused tests — verify PASS.
5. Run: `wp_test({\"files\":[\"src/hooks/pretool-guard/dev-routing.test.ts\",\"src/mcp/server.integration.test.ts\"]})`.

**Acceptance:**

- [x] Hook guidance names the shipped `wp_*` tools
- [x] Raw verification command families route toward MCP-first guidance
- [x] Hook guidance distinguishes MCP/tool routing names from public CLI command
      brands and does not reintroduce legacy durable public CLI aliases
- [x] Focused routing/integration tests pass
#### Task 1.4: [runtime] Decouple `wp config secrets` from `@webpresso/webpresso`

**Status:** done

**Depends:** Task 1.1, Task 1.2

Remove the direct runtime dependency on `@webpresso/webpresso` after the
finalized public secret contract is available in a host-neutral form. Today the
blocking import is `src/cli/commands/config.ts` dynamically loading
`@webpresso/webpresso/runtime/env`; tests and package preflight checks encode
that dependency as intentional. This task either moves the required secret
runtime adapter into agent-kit or makes the external runtime an optional,
well-diagnosed capability rather than a required dependency.

**Recommended architecture:** prefer an agent-kit-owned minimal secret config
adapter, with any legacy `@webpresso/webpresso/runtime/env` loader only as an
explicit optional compatibility fallback. The adapter should cover config path,
read/write, setup/status, and provider auth/availability checks. It must not
grow into full secret fetching; CI/tail execution continues to use the separate
`with-secrets -- <cmd>` shell contract through `src/secret-gate/runner.ts`.

**Files:**

- Modify: `src/cli/commands/config.ts`
- Modify: `src/cli/commands/config.test.ts`
- Modify: `src/build/auth-preflight-packages.test.ts`
- Modify: `src/audit/package-surface.test.ts`
- Create or modify as needed: `src/cli/commands/config/secret-runtime-adapter.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify as needed: `.npmrc`
- Modify as needed: `.github/workflows/ci.webpresso.yml`
- Modify as needed: `.github/workflows/bundle-smoke.yml`
- Modify as needed: `.github/workflows/release.yml`
- Modify as needed: `package-surface.json`

**Steps (TDD):**

1. Add a failing config-command test proving `wp config secrets` works without a
   required dynamic load of `@webpresso/webpresso/runtime/env`, or fails with a
   clear optional-capability diagnostic when the external runtime is absent.
2. Update auth preflight expectations so package access probes no longer require
   `@webpresso/webpresso` unless an explicit compatibility mode still needs it.
3. Replace the dynamic import with the finalized host-neutral secret contract:
   an agent-kit-owned adapter, a public CLI-host injected dependency, or an
   optional peer loader with deterministic error messaging.
4. Remove `@webpresso/webpresso` from `package.json` when no runtime path or
   required CI probe still needs it, then refresh `pnpm-lock.yaml`.
5. Remove the repo-local `@webpresso/webpresso` reference-consumer baseline from
   `package-surface.json` unless compatibility mode remains documented.
6. Run: `wp_test({"files":["src/cli/commands/config.test.ts","src/build/auth-preflight-packages.test.ts","src/audit/package-surface.test.ts"]})`.
7. Run: `wp_typecheck({})`.
8. Run: `wp_audit({"kind":"package-surface"})`.

**Acceptance:**

- [x] `src/cli/commands/config.ts` no longer dynamically loads
      `@webpresso/webpresso/runtime/env` as a required runtime dependency.
- [x] Tests no longer mock `@webpresso/webpresso/runtime/env` as the default
      config-command runtime.
- [x] A boundary test fails on any future required
      `@webpresso/webpresso/runtime/env` reference in config-command runtime
      code.
- [x] No-runtime behavior is deterministic: either a host-neutral adapter works,
      or optional-capability failure has a stable user-facing diagnostic and
      exit code.
- [x] `package.json` has no direct `@webpresso/webpresso` dependency unless a
      documented optional compatibility mode remains.
- [x] Auth preflight and CI package probes match the new host-neutral secret
      runtime boundary.
- [x] Package-surface freshness checks no longer need a repo-local override for
      scoped `@webpresso/webpresso` unless compatibility mode remains.
- [x] Workflow package probes are explicitly retargeted or removed, not merely
      dropped from test coverage.
- [x] Focused config/preflight/package-surface tests, `wp_typecheck`, and
      `package-surface` pass.

**Accepted outcomes:**

1. Agent-kit consumes a finalized host-neutral public secret adapter.
2. Agent-kit owns the minimal adapter locally.
3. External runtime loading remains optional with deterministic diagnostics.

A required runtime dependency on `@webpresso/webpresso/runtime/env` is not
accepted.

**Resolved blockers / final contract:**

- The framework hard-cut lane is completed, and agent-kit now owns the minimal
  local adapter needed for `wp config secrets set|show|status|setup`.
- `wp config secrets setup` is deterministic without a required framework
  runtime: local status/read/write works in agent-kit, while provider setup
  reports explicit CLI availability diagnostics.
- `wp_ci_act` and `wp_worker_tail` now agree on the same `with-secrets -- <cmd>`
  shell contract for secret-gated execution.
- The `with-secrets` binary remains the external shell contract for CI/tail
  execution; this blueprint stabilizes how agent-kit invokes it rather than
  bundling secret fetching into MCP tools.
- Workflow probes now validate `@webpresso/agent-kit@latest` package access
  instead of requiring `@webpresso/webpresso@latest`.
- The direct `@webpresso/webpresso` dependency and repo-local package-surface
  baseline were removed without redefining future `webpresso` package/bin
  ownership; that remains governed by `planned/agent-kit-cli-bundle-cutover`.
#### Task 1.5: [docs] Align downstream-facing docs and cross-plan references

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-05-27T12:00:00Z"},{"audit_kind":"roadmap-links","command":"WP_SKIP_UPDATE_CHECK=1 wp audit roadmap-links","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-05-27T12:00:00Z"},{"actor":"codex","allow_manual":true,"description":"Context-mode grep found no stale legacy CI wrapper wording, AK-prefixed alias wording, durable wp CLI alias wording, unimplemented-lane wording, or local absolute path matches in README, docs/blueprint-format.md, and active blueprint docs.","kind":"manual","log_excerpt":"ctx_execute stale doc refs check returned no matches for legacy CI wrapper wording, AK-prefixed alias wording, durable wp CLI alias wording, unimplemented-lane wording, or local absolute path patterns.","result":"pass","ts":"2026-05-27T12:00:00Z"}]
```

**Depends:** Task 1.3, Task 1.4

Refresh the blueprint, docs, and cross-plan references so downstream adopters
see the completed secret-aware CI/tail surface and current provider-neutral
guidance. Keep blueprint-authoring follow-up work explicitly
out of this lane.

**Files:**

- Modify: `blueprints/in-progress/secret-aware-worker-tail-mcp/_overview.md`
- Modify: `README.md`
- Modify: `docs/blueprint-format.md`

**Steps (TDD):**

1. Add or update checks that fail on legacy provider-specific CI wrappers and
   legacy MCP-alias references in active guidance, and on public-facing docs
   that present `wp` as the future public CLI brand rather than
   current-state/migration wording.
2. Run the focused checks — verify FAIL.
3. Update blueprint/docs/cross-plan language to the shipped MCP `wp_*` and
   `act-with-webpresso` reality while preserving the unified public CLI command
   boundary.
4. Re-run the focused checks — verify PASS.
5. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle`.

**Acceptance:**

- [x] Active guidance no longer describes this lane as unimplemented
- [x] Downstream references use `act-with-webpresso` and canonical MCP `wp_*`
      tool names, while any CLI examples distinguish current-state `wp ...`
      usage from future unified `webpresso ...` command ownership
- [x] Public-facing wording stays compatible with
      `planned/agent-kit-public-release-scrub`: no local absolute paths,
      unrelated private repo history, or claims that this lane makes the source
      repository public-ready
- [x] `wp audit blueprint-lifecycle` passes

**Completion notes:**

- `README.md` labels `wp ...` commands as current v0.x examples and reserves
  durable public command ownership for the future unified `webpresso ...`
  surface.
- `README.md` and this blueprint reserve `wp_*` names for MCP tools, including
  `wp_ci_act` and `wp_worker_tail`.
- Downstream CI helper references now point to `act-with-webpresso`,
  `with-secrets -- <cmd>`, and canonical MCP `wp_*` names.
- `docs/blueprint-format.md` keeps cross-repo references GitHub-link based and
  avoids local absolute paths in public examples.

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| CI act tests | `wp_test({"files":["src/mcp/tools/ci-act.test.ts"]})` | All pass |
| Worker tail tests | `wp_test({"files":["src/mcp/tools/worker-tail.test.ts"]})` | All pass |
| Config/preflight tests | `wp_test({"files":["src/cli/commands/config.test.ts","src/build/auth-preflight-packages.test.ts","src/audit/package-surface.test.ts"]})` | All pass |
| Routing tests | `wp_test({"files":["src/hooks/pretool-guard/dev-routing.test.ts","src/mcp/server.integration.test.ts"]})` | All pass |
| Package surface | `wp_audit({"kind":"package-surface"})` | Pass |
| Lifecycle audit | `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle` | Pass |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `planned/mcp-first-secret-surface-hard-cut-roadmap` | Local parent roadmap | Must list this child in its wave map. |
| [`webpresso/framework: public-secret-surface-hard-cut`](https://github.com/webpresso/framework/blob/main/blueprints/completed/public-secret-surface-hard-cut/_overview.md) | Documentary upstream dependency | Defines the finalized public secret contract consumed here. |
| [`webpresso/monorepo: secret-aware-ci-act-helper-adoption`](https://github.com/webpresso/monorepo/blob/main/webpresso/blueprints/planned/secret-aware-ci-act-helper-adoption/_overview.md) | Documentary downstream adopter | Must consume this stabilized surface instead of raw source-path wrappers. |
| [`ozby/ingest-lens: public-ci-surface-adoption`](https://github.com/ozby/ingest-lens/blob/main/blueprints/planned/public-ci-surface-adoption/_overview.md) | Documentary downstream adopter | Must use `act-with-webpresso`, `with-secrets -- <cmd>`, and `wp_*` naming. |
| `draft/blueprint-authoring-surface-hardening` | Sibling follow-up | Holds the split-out blueprint-authoring work. |

## Risks and edge cases

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Hook guidance changes diverge from actual registered tool names. | HIGH | Gate the change with MCP integration tests that assert `wp_*` names explicitly. |
| This repo re-plans framework work locally instead of consuming the final contract. | HIGH | Keep the framework child as an explicit dependency and scope this blueprint to consumer stabilization only. |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

