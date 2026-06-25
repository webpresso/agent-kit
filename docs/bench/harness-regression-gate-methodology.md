---
title: Harness regression gate methodology
type: guide
last_updated: 2026-06-14
---

# Harness regression gate methodology

The harness regression gate checks agent-kit harness changes against declared
reference-consumer suites. It extends the existing bench substrate instead of
creating a second benchmark stack.

## Benchmark target

The benchmark target is the maintained reference-consumer fleet, not
Terminal-Bench. Terminal-Bench and Harbor are useful architecture references for
splits and environment controls, but this gate answers a narrower release
question: did an agent-kit harness-surface change preserve behavior for real
consumers that already depend on the harness?

Each consumer declares deterministic held-in and held-out suite IDs in its own
`harness-gate/suites.yaml`. Agent-kit declares which consumers and suite IDs are
part of the gate in `catalog/agent/harness-gate/consumers.yaml`.

## Trigger routing

`scripts/bench/harness-gate/index.ts` maps changed files to
`catalog/agent/harness-surfaces.yaml` entries. Operators can pass files
explicitly with repeated `--changed-file` flags, or use the git helper:

```bash
bun scripts/bench/harness-gate/index.ts --json \
  --changed-files-from-git --base-ref origin/main --head-ref HEAD
```

The CI workflow remains planned-only unless downstream consumer worktrees are
available. Planned-only output proves that a harness-surface change selects the
right consumer suites; it is not downstream execution evidence.

## Verdict contract

The report is structured JSON with `summary` as the first field. The same summary
is also the first line in human-readable output, for example:

```text
Harness gate PLAN PASS: planned-only; selection-only; synthetic-manifest; 6 suite checks; 0 failures; 0 regressions; triggered harness-regression-gate.
```

`PLAN PASS` means the runner selected suites from the harness-surface plan; it
does not mean those suites executed. `comparisonMode: "selection-only"` is the
machine-readable version of that contract. The summary says `manifest-backed` when all
selected suites came from consumer manifests and `synthetic-manifest` when the
runner had to fall back to declared suite IDs because downstream manifests were
unavailable.

Important fields:

| Field                      | Meaning                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary`                  | Summary-first maintainer verdict                                                                                                                |
| `mode`                     | `planned-only` or `executed`                                                                                                                    |
| `triggeredSurfaces`        | Harness-surface IDs selected from changed files                                                                                                 |
| `comparisonMode`           | `selection-only` for planned CI, `self-baseline` for local executed smoke, or `baseline-candidate` when explicit measurement files are supplied |
| `manifestBacked`           | Whether all selected suites came from consumer manifests                                                                                        |
| `repeatCountJustification` | Repeat count plus observed variance evidence                                                                                                    |
| `coverageFailures`         | Triggered surfaces with no suite coverage, or missing selected-suite baseline/candidate measurements                                            |
| `deltas`                   | Baseline-vs-candidate pass-rate and duration deltas for selected suites                                                                         |
| `suites`                   | Per-suite planned or executed results                                                                                                           |

## Regression interpretation

The local no-delta smoke path compares measured samples to themselves; the test
protects the invariant that an unchanged baseline must not report a regression.
Executed mode records pass/fail samples and observed duration variance so
maintainers can raise `--repeat-count` based on measured instability instead of
guessed timeout or cost numbers.

For real regression evidence, provide explicit measurement files from the same
selected suites on baseline and candidate checkouts. Measurements carry both
`consumer` and `suiteId`, and comparisons key on that pair rather than assuming
repo-global suite ID uniqueness:

```bash
bun scripts/bench/harness-gate/index.ts --json \
  --changed-file catalog/agent/harness-surfaces.yaml \
  --baseline-measurements baseline.json \
  --candidate-measurements candidate.json
```

That path reports `comparisonMode: "baseline-candidate"`. A green result means
every triggered surface has at least one selected suite, and every selected suite
has both baseline and candidate measurements. Missing surface or selected-suite
coverage is reported in `coverageFailures` and fails the verdict. Unrelated extra
suites in the measurement files are ignored. Held-out regressions
block promotion, while held-in failures usually indicate an immediate
compatibility break or a non-deterministic suite that must be fixed before
trusting the gate.
