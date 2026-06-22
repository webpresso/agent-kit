---
type: blueprint
title: "agent-kit: wp deploy orchestrator + toolchain-isolation audit"
owner: ozby
status: completed
historical_verification_gap_waiver: true
complexity: L
created: "2026-06-02"
last_updated: "2026-06-07"
progress: "COMPLETED (2026-06-04): the shipped deploy/audit surfaces were grounded as already present; the remaining repo-local delta (`react-library.json` owning `types: [\"react\", \"react-dom\"]`) is implemented and covered by regression proof. Repo-local closeout proof passed via `wp test --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/init.integration.test.ts`, `wp typecheck`, `wp lint --file src/cli/commands/init/config.ts --file src/cli/commands/init/index.ts --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/init.integration.test.ts`, `wp audit blueprint-lifecycle --legacy-omx`, `wp test --file src/config/tsconfig/tsconfig-parity.test.ts --file src/config/export-resolution.test.ts`, and `bun scripts/public-consumer-smoke.ts --setup-only --skip-build`. Downstream consumer dry-run adoption remains owned by their blueprints."
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

**Goal:** Make `@webpresso/agent-kit` own the generic dev/deploy *toolchain*
runtime so a consumer can build, test, typecheck, lint, and deploy a
Cloudflare Worker through the **global `wp` + required `wp setup`** contract.
This does **not** mean "zero install" or "no repo-local shared packages":
consumers may still keep root dependencies such as `@webpresso/agent-kit` when
they import its config/runtime subpaths. Add a provider-agnostic `wp deploy`
orchestrator and a `wp audit toolchain-isolation` gate. Provider-specific
plumbing (Cloudflare/Pulumi/Neon) stays in each consumer's deploy adapter — it
does **not** move into shared agent-kit surfaces.

This is the **parent/upstream** blueprint. The three consumer blueprints depend
on it:

- ozby.dev — `ozby/ozby-dev/blueprints/in-progress/2026-06-02-ozby-dev-strict-agent-kit-dogfood.md`
- edge-matte — `ozby/edge-matte/blueprints/planned/2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md` (documentary split-consumer adopter; keep `vp` + `wp` and local deploy specifics)
- ingest-lens — `ozby/ingest-lens/blueprints/planned/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md` (documentary `wp`-first adopter; QA/CI stays on canonical `wp_*` + secret-gate surfaces)

Because those child blueprints live in other repos, they are documentary
cross-repo references here. `wp audit roadmap-links` in `agent-kit` cannot
validate them; the durable local coordination artifact is
`blueprints/completed/2026-05-30-cross-project-wp-execution-map.md`.

## Provenance

Recovered on 2026-06-03 from three plan-reviewer Claude transcripts dated
2026-06-02 (run from `webpresso/agent-kit`): `9d31160c…` (09:59), `93cfc552…`
(~12:03), `6e82eaf1…` (13:50). The plan was never written to a file before now;
the only prior artifact was the ozby.dev scaffold commit `d6d5722`
("feat: scaffold wp-owned ozby.dev", 2026-06-02 17:18). Two versions existed
(see Appendix A); this blueprint records the **revised V2** plus the reviewer
de-scope.

## Outcome (2026-06-04)

- Grounding confirmed that Task 1.1, Task 1.2, Task 2.1, and Task 2.2 were
  already shipped in `agent-kit`; this lane did **not** rebuild them.
- The only remaining repo-local product delta was Task 1.3, now implemented in
  `src/config/tsconfig/react-library.json` with regression coverage in
  `src/config/tsconfig/tsconfig-parity.test.ts`.
- The original "all three consumers" proof in Task 3.1 is a **downstream**
  adoption lane, not repo-local `agent-kit` work. This upstream blueprint now
  closes on package-owned proof plus public-consumer setup proof; consumer repo
  dry-run / lockfile validation remains tracked in the dependent blueprints.

## Product wedge anchor

- **Stage outcome:** Prove the agent-kit extraction works for a brand-new
  3rd-party consumer through the explicit global-install contract — the "does
  this work for a 3rd party" bar in the workspace `CLAUDE.md` / `VISION.md`
  facade-first model.
- **Consuming surface:** `wp deploy --lane prd` and `wp deploy --lane prd --dry-run`
  invoked from `ozby/ozby-dev` (`package.json` scripts already reference them);
  later adopted by edge-matte and ingest-lens.
- **New user-visible capability:** a consumer can deploy a Cloudflare Worker and
  pass full QA through global `wp` surfaces without owning generic tool runtime
  packages directly, while still keeping any root shared-package imports the
  repo actually uses.

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
| Toolchain isolation semantics | "Strict" means no consumer-owned generic tool runtime, not "no bootstrap" and not "no root shared-package deps ever". | The finalized contract is global `wp` + `wp setup`, with `.webpressorc.json` as the live repo config and root `@webpresso/agent-kit` still allowed where subpath imports require it. |
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

**Status:** done

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

- [x] Each managed tool resolves with no consumer-local `.bin` entry
- [x] Zero hardcoded `.bin/<tool>` or `<tool>.mjs` strings
- [x] Scoped lint + tests pass

#### [infra] Task 1.2: `agent-kit.config.ts` `deploy.adapterModule` contract + DeployPlan type

**Status:** done

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

- [x] `deploy.adapterModule` loads and validates
- [x] Existing `deploy.cloudflare` lane/env/metadata validation preserved
- [x] Lane IDs validated as `dev|preview_main|preview_pr_<n>|prd`

#### [infra] Task 1.3: React preset owns its React `types` array

**Status:** done

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

- [x] `react-library.json` sets `types: ["react", "react-dom"]`
- [x] `tsconfig-parity` + `export-resolution` tests green

**Follow-up note:** consumer override removal after release stays with the
dependent consumer blueprints; it is not remaining upstream agent-kit work in
this completed blueprint.

### Phase 2: Orchestrator + isolation audit [Complexity: L]

#### [infra] Task 2.1: `wp deploy` provider-agnostic orchestrator

**Status:** done

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

- [x] `wp deploy --dry-run --lane prd` passes with no Cloudflare secrets
- [x] `--plan-json` emits a stable DeployPlan
- [x] Built on `launch`, not a parallel stack
- [x] §5 contract-delta documented

#### [qa] Task 2.2: `wp audit toolchain-isolation`

**Status:** done

**Depends:** Task 1.1

New audit that fails when a consumer declares a forbidden direct dependency
(typescript, vite, vitest, stryker, playwright, wrangler, @cloudflare/vite-plugin,
react type packages, tsx, oxlint, formatter/test/build tooling) or calls those
tools through bare package scripts. Forbidden tools are allowed only as
transitive deps of `@webpresso/agent-kit` or via managed tool steps.

**Files:**

- Create: `wp audit toolchain-isolation` audit source + fixtures + tests

**Acceptance:**

- [x] Flags a forbidden direct dep
- [x] Flags a bare `vitest`/`wrangler` package script
- [x] Passes when those tools appear only transitively under agent-kit

### Phase 3: Proof [Complexity: M]

#### [qa] Task 3.1: Fresh-clone zero-local-tooling proof

**Status:** done

**Depends:** Task 2.1, Task 2.2

The original review asked for proof across all three downstream consumers. That
is not repo-local `agent-kit` work and cannot be completed inside this lane
without crossing the user-imposed repo boundary. The upstream closeout proof is:

1. repo-local package verification for the config/CLI/audit surfaces, and
2. a packed public-consumer setup smoke test showing a fresh temp repo can
   install `@webpresso/agent-kit`, run `wp setup`, and receive the expected
   wp-owned configs/scripts with no extra local tool bootstrap.

Per-consumer QA / deploy dry-run / lockfile proof stays with the dependent
consumer blueprints.

**Acceptance:**

- [x] Repo-local package verification passes for the touched surfaces (`wp test`, `wp typecheck`, `wp lint`, blueprint lifecycle audit, targeted tsconfig/export tests)
- [x] `bun scripts/public-consumer-smoke.ts --setup-only --skip-build` passes against a packed temp consumer

**Downstream follow-up (not acceptance for this completed upstream blueprint):**

- All three consumers: `wp typecheck && wp lint && wp test && wp e2e` green via
  agent-kit-owned tools — tracked in the dependent consumer blueprints
- All three: `wp audit toolchain-isolation` passes — tracked in the dependent
  consumer blueprints
- All three: `wp deploy --dry-run --lane prd` passes without secrets — tracked
  in the dependent consumer blueprints
- Lockfile inspection confirms forbidden tools are transitive-only — tracked in
  the dependent consumer blueprints

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

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
