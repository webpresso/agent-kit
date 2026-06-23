---
type: blueprint
title: "Fix pre-existing public-readiness gates"
owner: agent-kit
status: completed
complexity: S
created: '2026-06-23'
last_updated: '2026-06-23'
progress: '100% (completed 2026-06-23; public-readiness regressions fixed and re-verified)'
depends_on: []
tags:
  - agent-kit
  - release-readiness
  - docs
  - setup
  - smoke
completed_at: '2026-06-23'
---

# Fix pre-existing public-readiness gates

## Product wedge anchor

- **Stage outcome:** the public-readiness gate is green again for the shipped `@webpresso/agent-kit` package.
- **Consuming surface:** release/readiness gates, fresh-repo setup smoke, and public onboarding docs.
- **New user-visible capability:** fresh-repo docs and smoke now align on `wp setup --project-init`, and release readiness no longer fails on stale public-doc surfaces.

## Goal

Clear the pre-existing `public:readiness` failures that were unrelated to the new runtime typecheck parity work.

## Acceptance Criteria

- `vp run public:readiness` passes.
- The packed consumer smoke uses the current fresh-repo setup contract.
- Public docs have no broken links or stale local-path literals.
- Research-only benchmark/parity material is kept out of public claim-gated docs.
- The generated default `AGENTS.md` remains within the 8 KB prompt budget.

## Completed Tasks

1. Updated public onboarding docs and packed-consumer smoke to use `wp setup --project-init` for fresh repos.
2. Fixed the broken `repo-to-preview-url` docs link and removed stale `~/.claude` literals from public docs.
3. Moved the context-management parity matrix from `docs/competitive/` into `docs/research/` so benchmark-claim gating no longer treats it as public product marketing.
4. Trimmed the generated AGENTS template comment block so fresh-repo `AGENTS.md` stays under the prompt budget cap.

## Verification Evidence

- `node ./bin/docs-lint.js README.md docs/getting-started.md docs/README.md docs/skills-catalog.md` — PASS.
- `wp test --file scripts/public-readiness.test.ts` — PASS.
- `wp test --file src/cli/commands/init/scaffold-agents-md.test.ts` — PASS.
- `bun scripts/public-consumer-smoke.ts --setup-only --skip-build` — PASS.
- `wp lint --file README.md --file docs/getting-started.md --file docs/README.md --file docs/skills-catalog.md --file scripts/public-consumer-smoke.ts --file scripts/public-readiness.test.ts --file catalog/AGENTS.md.tpl` — PASS.
- `wp typecheck --file scripts/public-consumer-smoke.ts --file scripts/public-readiness.test.ts --file src/cli/commands/init/scaffold-agents-md.ts` — PASS.
- `vp run public:readiness` — PASS.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T00:00:00.000Z
- verified-head: 2311a9c8b4f29a7c302ad1fa88346f0d95edade4
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | Public readiness is owned by the repo-local release gate and its supporting scripts. | repo:scripts/public-readiness.ts |
| C2 | The packed consumer smoke now matches the current fresh-repo setup contract. | repo:scripts/public-consumer-smoke.ts |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | How to handle the context-management parity matrix in public readiness. | Move it to `docs/research/` as research-only material. | Keep it in public docs and weaken benchmark claim gating. | The gate should stay strict; the document was research, not product marketing. |
| D2 | How to resolve the AGENTS prompt-budget overrun. | Trim template boilerplate. | Raise the 8 KB cap. | The cap is intentional and should remain enforced. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-23T00:00:00.000Z |

### Residual Unknowns

None.
