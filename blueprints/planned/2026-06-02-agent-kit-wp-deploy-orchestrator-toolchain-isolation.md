---
type: blueprint
title: "agent-kit: wp deploy orchestrator + toolchain-isolation audit"
owner: ozby
status: planned
complexity: L
created: "2026-06-02"
last_updated: "2026-06-03"
progress: "0% (recovered from 2026-06-02 plan-reviewer transcripts; de-scoped per reviewer pushback; ozby.dev scaffold already landed with a consumer-owned deploy adapter)"
review_target: internal multi-repo platform work
depends_on: []
tags:
  - agent-kit
  - wp-deploy
  - toolchain-isolation
  - cloudflare
  - deploy-contract
  - dogfood
---

# agent-kit: wp deploy orchestrator + toolchain-isolation audit

**Goal:** Make `@webpresso/agent-kit` own the generic dev/deploy *toolchain* so a
consumer can build, test, typecheck, lint, and deploy a Cloudflare Worker with
its only direct dev dependency being `@webpresso/agent-kit`. Add a
provider-agnostic `wp deploy` orchestrator and a `wp audit toolchain-isolation`
gate. Provider-specific plumbing (Cloudflare/Pulumi/Neon) stays in each
consumer's deploy adapter — it does **not** move into shared agent-kit surfaces.

This is the **parent/upstream** blueprint. The three consumer blueprints depend
on it:

- ozby.dev — `ozby/ozby-dev/blueprints/in-progress/2026-06-02-ozby-dev-strict-agent-kit-dogfood.md`
- edge-matte — `ozby/edge-matte/blueprints/planned/2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md`
- ingest-lens — `ozby/ingest-lens/blueprints/planned/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md`

## Provenance

Recovered on 2026-06-03 from three plan-reviewer Claude transcripts dated
2026-06-02 (run from `webpresso/agent-kit`): `9d31160c…` (09:59), `93cfc552…`
(~12:03), `6e82eaf1…` (13:50). The plan was never written to a file before now;
the only prior artifact was the ozby.dev scaffold commit `d6d5722`
("feat: scaffold wp-owned ozby.dev", 2026-06-02 17:18). Two versions existed
(see Appendix A); this blueprint records the **revised V2** plus the reviewer
de-scope.

## Product wedge anchor

- **Stage outcome:** Prove the agent-kit extraction works for a brand-new 3rd-party
  consumer with zero local toolchain — the "does this work for a 3rd party" bar
  in the workspace `CLAUDE.md` / `VISION.md` facade-first model.
- **Consuming surface:** `wp deploy --lane prd` and `wp deploy --lane prd --dry-run`
  invoked from `ozby/ozby-dev` (`package.json` scripts already reference them);
  later adopted by edge-matte and ingest-lens.
- **New user-visible capability:** a consumer can deploy a Cloudflare Worker and
  pass full QA without any of tsc/vite/vitest/stryker/playwright/wrangler/oxlint
  as a direct dependency — they come transitively through `@webpresso/agent-kit`.

## Architecture Overview

```text
BEFORE
  agent-kit: wp lint|typecheck|test|e2e + config subpath exports
             (tsconfig/vite/vitest/stryker/playwright/oxlint/workers-test)
             toolchain mostly in devDependencies; NO first-class deploy verb
  consumers: each owns wrangler/vite/test scripts + provider plumbing

AFTER
  agent-kit (package-owned tools + orchestration)
    ├── managed runners resolve tsc/tsx/vite/vitest/stryker/playwright/
    │   wrangler/oxlint from agent-kit's own dependency graph
    ├── wp deploy  ── provider-agnostic orchestrator
    │     reads agent-kit.config.ts deploy.adapterModule
    │     resolves managed wrangler binary
    │     builds a DeployPlan, runs --dry-run / --plan-json
    └── wp audit toolchain-isolation
          rejects forbidden direct deps + bare tool scripts in consumers
        consumer deploy adapter (per repo, NOT in agent-kit)
          describes provider steps; Cloudflare/Pulumi/Neon logic stays here
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Toolchain ownership vs deploy plumbing | Separate them. agent-kit owns generic tools as package deps; provider plumbing stays in consumer adapters. | Reviewer V1 pushback: putting Cloudflare/Pulumi plumbing in agent-kit violates `catalog/agent/rules/extraction-parity.md` §5 and `public-package-safety.md`. |
| `wp deploy` shape | Provider-agnostic orchestrator + `deploy.adapterModule` contract; extend the existing `deploy.cloudflare` contract validation, don't replace it. | Keep the documented lane/env/metadata safety; record an intentional **contract delta**, not a pure relocation. |
| Lane IDs | `dev`, `preview_main`, `preview_pr_<n>`, `prd` (underscores). | V1 used dashed `preview-main`/`preview-pr-<n>` — violates the canonical internal lane IDs in `extraction-parity.md`. Cloud/provider-facing names are derived separately and dash-safe. |
| Reuse `launch` primitive | Build `wp deploy` on the existing `./launch` / `@webpresso/agent-tools-launch` primitive instead of a parallel stack. | V1 duplicated launch. Avoid two orchestration stacks. |
| Heavy dependency footprint | Accepted for the toolchain that ozby.dev's strict model requires; do not silently balloon all consumers. | Forcing every consumer to pull wrangler/vite/etc. as agent-kit hard deps was a V1 cost flagged by reviewers; gate behind managed-runner resolution so weight is opt-in via what the consumer actually invokes. |
| Provider plumbing publication | Cloudflare/Pulumi helper stays private/internal by default. | Mirrors the edge-matte deploy-contract blueprint boundary; any public promotion needs a separate package-surface blueprint + tarball/denied-content audit. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents |
| **Wave 1** | 2.1, 2.2 | Wave 0 | 2 agents |
| **Wave 2** | 3.1 | Wave 1 | 1 agent |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves |

T-shirt sizing per task below (XS/S/M/L/XL).

### Phase 1: Managed toolchain + deploy contract [Complexity: L]

#### [infra] Task 1.1: Managed runner resolution for the full toolchain

**Status:** todo

**Depends:** None

Extend agent-kit's managed-runner resolution (the same seam finalized for the
MCP Vitest launcher) so tsc/tsx/vite/vitest/stryker/playwright/wrangler/oxlint
all resolve from agent-kit's own dependency graph rather than the consumer's
`node_modules/.bin`. A consumer that lists none of these as direct deps must
still run every `wp` verb. Do not hardcode `node_modules/.bin/<tool>` or
`<tool>.mjs` paths — resolve structured command+args through the managed runner.

**Files:**

- Modify: `src/mcp/runners/*` and the CLI runner seam that resolves tool binaries
- Create: managed-runner resolution tests next to the runner source

**Steps (TDD):**

1. Write a failing test: resolve `vite`/`wrangler`/`stryker` with an empty
   consumer `.bin`.
2. Run the repo's scoped test recipe — verify FAIL.
3. Implement resolution from agent-kit's dependency graph.
4. Run the repo's scoped test recipe — verify PASS.

**Acceptance:**

- [ ] Each managed tool resolves with no consumer-local `.bin` entry
- [ ] Zero hardcoded `.bin/<tool>` or `<tool>.mjs` strings
- [ ] Scoped lint + tests pass

#### [infra] Task 1.2: `agent-kit.config.ts` `deploy.adapterModule` contract + DeployPlan type

**Status:** todo

**Depends:** None

Add a `deploy.adapterModule` field to the canonical `agent-kit.config.ts`
loader, alongside the existing `e2e.hostAdapterModule` pattern and the existing
`deploy.cloudflare` contract validation. Define the `DeployPlan` adapter
contract: the consumer adapter describes ordered steps; agent-kit resolves the
managed tool binaries for those steps. Forbidden tools may be requested **only**
through a managed tool step, never as a bare package script.

**Files:**

- Modify: `agent-kit.config.ts` loader/schema source + tests
- Create: `DeployPlan` type + adapter-loading + validation tests

**Steps (TDD):** write failing config-load + adapter-contract tests → implement → green.

**Acceptance:**

- [ ] `deploy.adapterModule` loads and validates
- [ ] Existing `deploy.cloudflare` lane/env/metadata validation preserved
- [ ] Lane IDs validated as `dev|preview_main|preview_pr_<n>|prd`

#### [infra] Task 1.3: React preset owns its React `types` array

**Status:** todo

**Depends:** None

`src/config/tsconfig/react-library.json` sets `jsx: react-jsx` + DOM libs but
inherits `types: ["node"]` from `base.json`, so every React consumer must
hand-repeat `"types": ["react", "react-dom"]` in its own `tsconfig.json`
(observed in `ozby-dev` and `ingest-lens/packages/ui` on 2026-06-03). The
sibling `react-router.json` preset already overrides `types`
(`["vite/client"]`), so this is an inconsistency, not a constraint. Add
`"types": ["react", "react-dom"]` to `react-library.json` so React consumers
inherit it and can drop their override.

**Blast radius (verified 2026-06-03):** the only live consumers of *agent-kit's*
`react-library.json` are `ozby-dev` and `ingest-lens/packages/ui`, and **both
already override `types`** — so this is zero-change for them and pure benefit for
future consumers. The ~30 monorepo `react-library.json` matches extend
`@repo/repo-config/tsconfig/react-library.json`, a **separate** preset, and are
**not** affected. Note: this is a published-surface change — it needs a release
before `ozby-dev` can drop its override, and must pass agent-kit CI
(`tsconfig-parity.test.ts`, `export-resolution.test.ts`) first. `@types/react*`
stay **consumer-owned** direct deps (type companions to the allowed
`react`/`react-dom` runtime deps) — they are NOT moved into agent-kit.

**Files:**

- Modify: `src/config/tsconfig/react-library.json`
- Verify: `src/config/tsconfig/tsconfig-parity.test.ts`, `src/config/export-resolution.test.ts`

**Acceptance:**

- [ ] `react-library.json` sets `types: ["react", "react-dom"]`
- [ ] `tsconfig-parity` + `export-resolution` tests green
- [ ] After release: `ozby-dev` drops its `tsconfig.json` `types` override and `wp typecheck` stays green

### Phase 2: Orchestrator + isolation audit [Complexity: L]

#### [infra] Task 2.1: `wp deploy` provider-agnostic orchestrator

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Implement `wp deploy` on top of the existing `launch` primitive:

- `wp deploy --lane dev|preview_main|preview_pr_<n>|prd`
- `wp deploy --dry-run`
- `wp deploy --plan-json`

It loads `deploy.adapterModule`, resolves managed wrangler, builds the
DeployPlan, and on `--dry-run` plans without provider secrets. Provider calls
live in the consumer adapter, not here. Document the `extraction-parity.md` §5
contract delta in agent-kit docs (deploy runner added; provider plumbing stays
consumer-owned).

**Files:**

- Create: `wp deploy` command + orchestrator source and tests
- Modify: agent-kit workflow/deploy docs (record the contract delta)

**Acceptance:**

- [ ] `wp deploy --dry-run --lane prd` passes with no Cloudflare secrets
- [ ] `--plan-json` emits a stable DeployPlan
- [ ] Built on `launch`, not a parallel stack
- [ ] §5 contract-delta documented

#### [qa] Task 2.2: `wp audit toolchain-isolation`

**Status:** todo

**Depends:** Task 1.1

New audit that fails when a consumer declares a forbidden direct dependency
(typescript, vite, vitest, stryker, playwright, wrangler, @cloudflare/vite-plugin,
react type packages, tsx, oxlint, formatter/test/build tooling) or calls those
tools through bare package scripts. Forbidden tools are allowed only as
transitive deps of `@webpresso/agent-kit` or via managed tool steps.

**Files:**

- Create: `wp audit toolchain-isolation` audit source + fixtures + tests

**Acceptance:**

- [ ] Flags a forbidden direct dep
- [ ] Flags a bare `vitest`/`wrangler` package script
- [ ] Passes when those tools appear only transitively under agent-kit

### Phase 3: Proof [Complexity: M]

#### [qa] Task 3.1: Fresh-clone zero-local-tooling proof

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Prove the model against the three consumers (see their blueprints). Clone each,
install, and run QA + deploy dry-run with **no** global tsc/vite/vitest/wrangler/
playwright/stryker/oxlint/tsx. Confirm consumer lockfiles show forbidden tools
only as transitive deps of `@webpresso/agent-kit`.

**Acceptance:**

- [ ] All three consumers: `wp typecheck && wp lint && wp test && wp e2e` green via agent-kit-owned tools
- [ ] All three: `wp audit toolchain-isolation` passes
- [ ] All three: `wp deploy --dry-run --lane prd` passes without secrets
- [ ] Lockfile inspection confirms forbidden tools are transitive-only

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | repo typecheck recipe | Zero errors |
| Lint | repo lint recipe (scoped) | Zero violations |
| Tests | repo test recipe (scoped) | All pass |
| Mutation | repo mutation recipe | No drop vs baseline (extraction-parity tolerance) |
| Public surface | package/tarball safety check | Intended dependency/export surface only |

## Risks and Edge Cases

- Wrangler `--dry-run` can pass while real deploy auth fails → keep a Workers
  Services API credential probe (`wp deploy verify-credentials`).
- React/TSX JSX types must be agent-kit-owned for strict consumers.
- CI secrets unavailable on forks → split no-secret gates from credentialed gates.
- Existing repos rely on local configs → preserve config subpath exports as
  advanced overrides; migrate consumers one at a time.

## Assumptions

- Cloudflare Workers remains the deploy target.
- "Strict" forbids generic toolchain/deploy-tool deps, **not** product/runtime deps.
- agent-kit may grow runtime dependencies to own the promised toolchain.
- Provider-specific deployment behavior stays in consumer adapters unless a
  future blueprint explicitly changes that contract.

## Appendix A — recovered V1 (maximal, superseded)

The 09:59 reviewer flagged V1 as over-scoped: it forced wrangler/vite/etc. as
agent-kit *package* deps, used generated (uncommitted) Wrangler config, and put
Cloudflare deploy plumbing inside agent-kit. Blocking issues: provider plumbing
in agent-kit (`extraction-parity.md` §5, `public-package-safety.md`); dashed
lane IDs (`preview-main`); duplication of the `launch` primitive; install bloat
for every consumer. V1 is preserved here only as historical record; the plan of
record is the V2 body above.
