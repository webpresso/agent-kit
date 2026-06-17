---
type: blueprint
title: "Extract @webpresso/agent-config (binary-free test/config tooling)"
owner: ozby
status: planned
complexity: L
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '0% (planned)'
depends_on: []
cross_repo_depends_on: []
tags:
  - packaging
  - extraction
  - public-package
  - config
  - hard-cut
max_parallel_agents: 3
---

# Extract `@webpresso/agent-config` (binary-free test/config tooling)

**Goal:** Move the consumer-pulled test/config presets (`tsconfig/*`, `vitest/**`,
`stryker`, `workers-test`) out of `@webpresso/agent-kit` into a new binary-free
package `@webpresso/agent-config`, as a **hard breaking cut**. The `wp` CLI, MCP,
runtime library (`./local`), and CLI-owned config (`oxlint`, `docs-lint`, etc.)
stay in agent-kit. Fully fact-checked against the live tree + an independent Codex
audit on 2026-06-17.

## Product wedge anchor

- **Stage outcome:** open-sourcing roadmap — a clean, coherent public contract for
  3rd-party consumers (`ozby/ingest-lens`, `ozby/edge-matte`) is the reference
  proof that extraction works for outside repos.
- **Consuming surface:** the `extends`/import surface in consumer `tsconfig*.json`,
  `vitest.config.ts`, `stryker.config.ts` — they import `@webpresso/agent-config/*`
  instead of mixing config imports into the CLI package namespace.
- **New user-visible capability:** a consumer can depend on a binary-free,
  light-dependency config package whose name says "config," distinct from the
  `wp` CLI toolchain.

## Honest scope (verified)

Both reference consumers keep depending on `@webpresso/agent-kit` regardless of
this split (ingest-lens for `@webpresso/agent-kit/local`, both for the `wp` CLI).
So this split delivers **contract cleanliness**, not install reduction and not
removal of the duplicate `wp` binary. The "two `wp`" pain is addressed separately
by [[2026-06-17-deconflict-wp-versions]]. This blueprint is scoped accordingly.

## Move boundary (verified)

**Move to `@webpresso/agent-config`:** `tsconfig/{base,cloudflare,library,react-library,react-router}.json`,
`vitest/**` (+ support files), `stryker`, `workers-test`.
**Keep in `@webpresso/agent-kit`:** `oxlint` (CLI-owned lint-engine config, consumed
internally at 4 sites, 0 consumer pull), `docs-lint`/`launch`/`test-preset`/`e2e-preset`/`mutation`
(0 pull, CLI/audit surfaces), `./local` (runtime API), `./blueprint`, CLI/MCP/hooks/session-memory.

## Fact-check findings (all verified 2026-06-17)

| ID | Finding | Effect |
| -- | ------- | ------ |
| F1 | `bun-sqlite-shim.ts:13` imports `better-sqlite3`, but `vitest/node.ts:31` references it **only as a vite-alias string** (lazy). | `better-sqlite3` → optional **peerDependency + devDependency**, NOT `optionalDependencies` (those still install). |
| F2 | agent-kit internally imports the config tree **only for oxlint** (`src/lint/index.ts:10`, `src/build/generate-oxlintrc.ts:11`, `src/cli/commands/lint.ts:3`, `src/mcp/tools/lint.ts:19`). | Keep oxlint in agent-kit → no agent-kit→agent-config **runtime** dep. |
| F5 | tsconfig presets **self-extend** agent-kit: `src/config/tsconfig/{library,cloudflare,react-library,react-router}.json:4`. | tsconfig move is **not** diff-empty — rewrite the 4 extends to `@webpresso/agent-config/...`. |
| F6 | agent-kit **self-hosts** the moved configs: root `stryker.config.ts:4` dynamically imports `src/config/stryker/index.ts`; root `tsconfig.json:74-86` maps `#config/{tsconfig,vitest,stryker,workers-test}/*`; `package.contract.test.ts:55-63` asserts the 4 exports. | Task 3.1 rewires all three. |
| F7 | `workers-test` exports runtime mocks and statically imports `vitest` (`env.ts:3`, `setup.ts:1`, `execution-context.ts:3`). | New package is **test/config tooling**; `vitest` is a real dep. |
| F9 | agent-kit itself uses `better-sqlite3` (`src/blueprint/db/sqlite.ts:28`). | Unaffected — stays a hard dep of agent-kit. |

**Verification standard:** byte-identity + mutation-score parity (`catalog/agent/rules/extraction-parity.md`).

## Tasks

#### [infra] Task 1.1: Scaffold `packages/agent-config`
**Status:** todo **Depends:** None
**Files:** Create `packages/agent-config/package.json` (name `@webpresso/agent-config`,
`"type":"module"`, `"sideEffects":false`, **no `bin`**, empty `exports` stub, deps =
`vite-plus`/`vitest`/`vite`/`@vitejs/plugin-react`, `better-sqlite3` as optional peer
**and** devDep — not optionalDependencies, F1); `packages/agent-config/tsconfig.json`
+ tshy build; Modify `pnpm-workspace.yaml` (add `packages/*`).
**Acceptance:** [ ] resolves in workspace [ ] no `bin` [ ] `better-sqlite3` absent from `dependencies`/`optionalDependencies` [ ] builds empty.

#### [config] Task 2.1: Move `tsconfig/*` (NOT diff-empty, F5)
**Status:** todo **Depends:** 1.1
Move `src/config/tsconfig/*.json` → `packages/agent-config/src/tsconfig/`; **rewrite the
4 self-extends** to `@webpresso/agent-config/tsconfig/...`; add the 5 keys to `exports`.
**Acceptance:** [ ] 4 self-extends rewritten [ ] 5 keys resolve [ ] react-router→react-library→library→base chain intact [ ] `diff -ru` import-path-only.

#### [config] Task 2.2: Move `vitest/**` (+ support, F1)
**Status:** todo **Depends:** 1.1
Move whole `src/config/vitest/` incl. `bun-sqlite-shim`, `flakiness-reporter`,
`pool-defaults`, `version-guard`, `generated-runtime-aliases`, `node-setup`,
`react-setup`, `ambient.d.ts`, `consumer-package`, `vitest-parity.test.ts`.
**Acceptance:** [ ] `nodeConfig`/`workersConfig`/`reactConfig` resolve [ ] `npm pack --dry-run` proves no `better-sqlite3` in a default install [ ] shim resolves when `bun:sqlite` is used.

#### [config] Task 2.3: Move `stryker` + `workers-test` (vitest peer, F7)
**Status:** todo **Depends:** 1.1
Move `src/config/{stryker,workers-test}/`; add `./stryker`,`./workers-test`; declare
`vitest` real; `@stryker-mutator/*`/`@cloudflare/vitest-pool-workers`/`wrangler` optional peers.
**Acceptance:** [ ] both groups resolve [ ] `vitest` declared [ ] mocks import under a consumer install.

#### [config] Task 2.4: agent-config isolation + surface guards
**Status:** todo **Depends:** 2.1, 2.2, 2.3
**Files:** `packages/agent-config/src/export-isolation.test.ts` (4 groups public, no
`@webpresso/agent-kit`/`#cli`/MCP leak); `publint`; `attw --pack`.
**Acceptance:** [ ] isolation green [ ] publint clean [ ] attw clean.

#### [agent-kit] Task 3.1: Strip exports + rewire self-hosting + drop preferGlobal + major bump (F6)
**Status:** todo **Depends:** 2.4
**Files:** Modify `package.json` (delete the 4 export groups, delete `"preferGlobal"` `:30`,
trim `files`); Delete moved `src/config/{tsconfig,vitest,stryker,workers-test}`; **Rewire
self-hosting:** root `stryker.config.ts:4` → `@webpresso/agent-config/stryker`; root
`tsconfig.json:74-86` → drop `#config/{tsconfig,vitest,stryker,workers-test}/*` (keep
`#config/oxlint/*`); `package.contract.test.ts:55-63` → assert the 4 are **absent** (keep
oxlint); add agent-config as a **devDependency** of agent-kit; `.changeset/*` major.
**Acceptance:** [ ] 4 groups gone [ ] root stryker/tsconfig/contract-test rewired [ ] preferGlobal gone [ ] oxlint/docs-lint/local/mutation intact [ ] `wp lint`/`wp test`/self-mutation green [ ] publint clean.

## Quick Reference (Execution Waves)

| Wave | Tasks | Depends | Parallel |
| ---- | ----- | ------- | -------- |
| 0 | 1.1 | None | 1 |
| 1 | 2.1, 2.2, 2.3 | 1.1 | 3 (disjoint files) |
| 2 | 2.4 | 2.1–2.3 | 1 |
| 3 | 3.1 | 2.4 | 1 |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| better-sqlite3 re-enters default install | optional peer+dev (not optionalDependencies, F1); `npm pack` dep-tree assertion |
| agent-kit self-hosting breaks (F6) | Task 3.1 rewires root stryker/tsconfig/contract-test; `wp test`/self-mutation gate |
| tsconfig self-extends point at dead subpaths (F5) | Task 2.1 rewrites the 4 extends |
| accidental agent-kit→agent-config cycle | keep oxlint in agent-kit (F2); isolation test bans the import (2.4) |

## Downstream

Consumers adopt the new package after this lands and a major is published:
ingest-lens (`blueprints/planned/2026-06-17-adopt-agent-config.md`) and edge-matte
(same). Publish order: agent-config → agent-kit major → consumers.
