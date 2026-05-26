---
type: blueprint
title: Secret-aware Worker Tail and CI Act MCP completion
status: planned
owner: agent-kit
complexity: M
created: '2026-05-23'
last_updated: '2026-05-26'
progress: '0/4 tasks done (0%) - refreshed to match shipped MCP/tooling reality on 2026-05-26'
depends_on: []
cross_repo_depends_on:
  - repo: webpresso/framework
    slug: public-secret-surface-hard-cut
    require_status: planned
tags:
  - mcp
  - wrangler
  - cloudflare
  - secrets
  - ci
  - hooks
parent_roadmap: planned/mcp-first-secret-surface-hard-cut-roadmap
---

# Secret-aware Worker Tail and CI Act MCP completion

## Product wedge anchor

The core `wp_worker_tail`, `wp_ci_act`, and `wp_*` routing surfaces already
exist, but the planned blueprint still describes them as greenfield work and
bundles unrelated scope. This blueprint finishes the real remaining lane:
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

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Public verification names | Keep `wp_*` as canonical | These are the real tool names currently registered in MCP. |
| Upstream dependency | Depend on `framework` hard-cut cleanup | Agent-kit should consume the finished public secret contract, not re-define it. |
| Child scope | CI/tail/helper/routing only | Keeps unrelated blueprint-authoring work out of the execution lane. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | Framework child delivered | 2 agents | S-M |
| **Wave 1** | 1.3, 1.4 | 1.1, 1.2 | 2 agents | S |
| **Critical path** | 1.1 → 1.3 | — | 2 waves | M |

#### Task 1.1: [mcp] Stabilize `wp_ci_act` against the finalized public secret contract

**Status:** todo

**Depends:** None

Update the existing `wp_ci_act` tool and CLI command surfaces so they consume
the finalized public secret contract from `framework` without carrying stale
assumptions about provider-specific fallbacks or greenfield helper creation.

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

- [ ] `wp_ci_act` no longer relies on stale secret-contract assumptions
- [ ] CLI and MCP flows agree on the same helper/secret path
- [ ] `wp_typecheck` passes

#### Task 1.2: [mcp] Stabilize `wp_worker_tail` and shared secret-gated execution helpers

**Status:** todo

**Depends:** None

Refresh the existing worker-tail lane so it uses the same finalized secret-gate
contract and bounded execution expectations as the CI act lane. The output
envelope stays compact and agent-safe.

**Files:**

- Modify: `src/mcp/tools/worker-tail.ts`
- Modify: `src/mcp/tools/worker-tail.test.ts`
- Modify: `src/mcp/tools/_shared/secret-gate-runner.ts`

**Steps (TDD):**

1. Add failing tests for the finalized shared secret-gate behavior used by
   worker tail.
2. Run: `wp_test({\"files\":[\"src/mcp/tools/worker-tail.test.ts\"]})` — verify FAIL.
3. Update the tool and shared helper for the finalized contract.
4. Run: `wp_test({\"files\":[\"src/mcp/tools/worker-tail.test.ts\"]})` — verify PASS.
5. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] `wp_worker_tail` uses the finalized shared secret-gate contract
- [ ] Shared helper expectations match the CI act lane
- [ ] `wp_typecheck` passes

#### Task 1.3: [hooks] Tighten pretool routing and guidance to the real `wp_*` names

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Update hook guidance and routing coverage so shell-first verification commands
are redirected toward the shipped `wp_*` tools, not stale `ak_*` aliases or raw
package-manager entrypoints.

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Add failing routing tests for stale `ak_*` guidance and shell verification
   paths.
2. Run the focused hook/integration tests — verify FAIL.
3. Update the routing/guidance strings to the real `wp_*` surface.
4. Re-run the focused tests — verify PASS.
5. Run: `wp_test({\"files\":[\"src/hooks/pretool-guard/dev-routing.test.ts\",\"src/mcp/server.integration.test.ts\"]})`.

**Acceptance:**

- [ ] Hook guidance names the shipped `wp_*` tools
- [ ] Raw verification command families route toward MCP-first guidance
- [ ] Focused routing/integration tests pass

#### Task 1.4: [docs] Align downstream-facing docs and cross-plan references

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Refresh the blueprint, docs, and cross-plan references that still describe
IngestLens as `act-with-doppler`-based or this repo as pre-implementation.
Keep blueprint-authoring follow-up work explicitly out of this lane.

**Files:**

- Modify: `blueprints/planned/secret-aware-worker-tail-mcp/_overview.md`
- Modify: `README.md`
- Modify: `docs/blueprint-format.md`

**Steps (TDD):**

1. Add or update checks that fail on stale `act-with-doppler` and `ak_*`
   references in active guidance.
2. Run the focused checks — verify FAIL.
3. Update blueprint/docs/cross-plan language to the shipped `wp_*` and
   `act-with-webpresso` reality.
4. Re-run the focused checks — verify PASS.
5. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle`.

**Acceptance:**

- [ ] Active guidance no longer describes this lane as greenfield
- [ ] Downstream references use `act-with-webpresso` and `wp_*`
- [ ] `wp audit blueprint-lifecycle` passes

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| CI act tests | `wp_test({"files":["src/mcp/tools/ci-act.test.ts"]})` | All pass |
| Worker tail tests | `wp_test({"files":["src/mcp/tools/worker-tail.test.ts"]})` | All pass |
| Routing tests | `wp_test({"files":["src/hooks/pretool-guard/dev-routing.test.ts","src/mcp/server.integration.test.ts"]})` | All pass |
| Lifecycle audit | `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle` | Pass |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `planned/mcp-first-secret-surface-hard-cut-roadmap` | Local parent roadmap | Must list this child in its wave map. |
| [`webpresso/framework: public-secret-surface-hard-cut`](https://github.com/webpresso/framework/blob/main/blueprints/planned/public-secret-surface-hard-cut/_overview.md) | Documentary upstream dependency | Defines the finalized public secret contract consumed here. |
| [`webpresso/monorepo: secret-aware-ci-act-helper-adoption`](https://github.com/webpresso/monorepo/blob/main/webpresso/blueprints/planned/secret-aware-ci-act-helper-adoption/_overview.md) | Documentary downstream adopter | Must consume this stabilized surface instead of raw source-path wrappers. |
| [`ozby/ingest-lens: public-ci-surface-adoption`](https://github.com/ozby/ingest-lens/blob/main/blueprints/planned/public-ci-surface-adoption/_overview.md) | Documentary downstream adopter | Must use `act-with-webpresso`, `with-secrets -- <cmd>`, and `wp_*` naming. |
| `draft/blueprint-authoring-surface-hardening` | Sibling follow-up | Holds the split-out blueprint-authoring work. |

## Risks and edge cases

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Hook guidance changes diverge from actual registered tool names. | HIGH | Gate the change with MCP integration tests that assert `wp_*` names explicitly. |
| This repo re-plans framework work locally instead of consuming the final contract. | HIGH | Keep the framework child as an explicit dependency and scope this blueprint to consumer stabilization only. |
