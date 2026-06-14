---
type: blueprint
title: "Fixed-suite scientific benchmark proof"
owner: ozby
status: completed
completed_at: '2026-06-14'
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '100% implementation complete; deterministic gates pass; targeted Contract-A mutation gate reached 100.00%'
depends_on:
  - 2026-06-13-context-engine-proof-slices
cross_repo_depends_on: []
tags:
  - context-engine
  - benchmark
  - session-memory
  - scientific-proof
  - codex
  - qrel-provenance
max_parallel_agents: 4
---

# Fixed-suite scientific benchmark proof

## Goal

Harden the session-memory/context-reducer benchmark so claims are falsifiable for
only the current fixed suite: **3 scenarios and 15 qrels**. This blueprint does
not claim generalized quality, release readiness, or hook/plugin correctness.

## Claim scope

- `claim_scope`: `fixed_suite_scientific`
- Corpus: 3 scenario fixtures, 15 qrels
- Provider conformance: Claude/Codex fixture and runner contract only unless a
  live Tier gate is explicitly run later
- Hooks/plugins: diagnostic-only; not scientific evidence

## Implemented decisions

1. Added independent qrel provenance fields to every qrel, including source
   span/hash, expected-evidence hash, written relevance criterion, primary
   labeler, and independent reviewer.
2. Added deterministic validation that fails when qrel source hashes drift,
   labeler/reviewer identity is not independent, or labeling-process fields are
   missing.
3. Added a closed evidence matrix/claim ledger helper that rejects
   `diagnostic_hook`, `manual_note`, and live-provider evidence for fixed-suite
   scientific claims.
4. Added a raw recall policy helper: single trial is integer matches divided by
   `min(5, qrels.length)`; threshold comparison uses raw `>= 0.8`; aggregate
   means use raw values with no epsilon.
5. Added a structural provider-envelope canary that ignores payload values but
   fails on key/type/nesting drift.
6. Extended transcript scoring fixtures/tests to cover Codex-shaped raw and
   recorder-wrapped cassettes through the same core path as Claude-shaped
   cassettes.
7. Added an opt-in Codex provider runner path that builds `codex exec --json`
   commands with isolated `CODEX_HOME`, `--output-last-message`, `--cd`,
   `--profile`, `--sandbox workspace-write`, and `--ignore-user-config`.
8. Future-proofed local Stryker runs by adding Stryker scratch/report artifacts
   to the setup-generated `.gitignore` block and base-kit `.gitignore`
   template.

## Non-goals preserved

- No hook correctness claim.
- No broad benchmark statistics claim.
- No generated agent/runtime surface edits.
- No package export or public API expansion.
- No live provider pass claim from this blueprint alone.

## Verification evidence

Focused benchmark suite:

```bash
./bin/wp test --file scripts/bench/scenarios/_schema.test.ts \
  --file scripts/bench/lib/manifest.test.ts \
  --file scripts/bench/lib/variant-runner.test.ts \
  --file scripts/bench/lib/report-writer.test.ts \
  --file scripts/bench/lib/transcript-scorer.test.ts \
  --file scripts/bench/lib/usage-extractor.test.ts \
  --file scripts/bench/lib/transcript-recorder.test.ts \
  --file scripts/bench/lib/recall-policy.test.ts \
  --file scripts/bench/lib/claim-ledger.test.ts \
  --file scripts/bench/lib/schema-envelope.test.ts \
  --file src/cli/commands/bench/session-memory.test.ts
```

Result: passed.

Additional gates:

```bash
./bin/wp typecheck
./bin/wp lint scripts/bench/scenarios/_schema.ts scripts/bench/scenarios/_schema.test.ts \
  scripts/bench/lib/recall-policy.ts scripts/bench/lib/recall-policy.test.ts \
  scripts/bench/lib/claim-ledger.ts scripts/bench/lib/claim-ledger.test.ts \
  scripts/bench/lib/schema-envelope.ts scripts/bench/lib/schema-envelope.test.ts \
  scripts/bench/lib/transcript-scorer.ts scripts/bench/lib/transcript-scorer.test.ts \
  scripts/bench/lib/variant-runner.ts scripts/bench/lib/variant-runner.test.ts
./bin/wp bench session-memory --dry-run
vp run verify:paths
vp run verify:secrets
```

Results: passed.

Stronger mutation gate:

```bash
STRYKER_MUTATE_FILES=$'scripts/bench/lib/recall-policy.ts\n\
scripts/bench/lib/claim-ledger.ts\n\
scripts/bench/lib/schema-envelope.ts\n\
scripts/bench/lib/transcript-scorer.ts' vp run test:mutation
```

Result: passed. Stryker reported 268 mutants, 262 killed, 6 timed out,
0 survived, 0 no-coverage, final mutation score **100.00%** across the targeted
Contract-A critical files. Per-file scores were 100.00% for `claim-ledger.ts`,
`recall-policy.ts`, `schema-envelope.ts`, and `transcript-scorer.ts`. Generated
Stryker reports were removed from the working tree after recording this evidence.

Coverage check note:

```bash
bunx vitest run --coverage scripts/bench/lib/recall-policy.test.ts \
  scripts/bench/lib/claim-ledger.test.ts \
  scripts/bench/lib/schema-envelope.test.ts \
  scripts/bench/lib/transcript-scorer.test.ts
```

Result: blocked because `@vitest/coverage-v8` is not installed in this package.
No dependency was added in this PoC. Mutation evidence is therefore the numeric
100% proof gate for this blueprint; line/branch coverage remains unclaimed.

Setup gitignore gate:

```bash
bunx vitest run src/cli/commands/init/gitignore-patcher.integration.test.ts \
  src/cli/commands/init/init.presets.integration.test.ts \
  src/audit/gitignore-agent-surfaces.test.ts \
  src/cli/commands/init/scaffold-base-kit.test.ts
```

Result: passed. The generated setup block and base-kit template now ignore
`.stryker-tmp/`, `reports/mutation/`, `reports/stryker-incremental.json`, and
`stryker-setup-*.js`; the index-cleanup path also untracks previously tracked
Stryker artifacts while leaving files on disk.

## Follow-ups

- Add or intentionally configure Vitest coverage support before claiming 100%
  line/branch coverage for Contract A critical modules.
- Add live Tier 1/Tier 2 provider-conformance evidence only when budget and
  credentials are intentionally provided.
- Promote hooks/plugins from diagnostic-only only through a separate blueprint
  with hook-specific canaries.
