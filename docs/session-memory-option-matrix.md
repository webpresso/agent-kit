---
type: guide
slug: session-memory-option-matrix
title: Session memory option matrix
status: active
last_updated: '2026-06-12'
---

# Session memory option matrix

Agent-kit currently treats lane-2 session memory as a selection program, not a
linear upgrade path. The current context tool remains the baseline until the
benchmark and parity wave chooses one replacement candidate.

- **Current context tool**: today's external lane-2 baseline.
- **Option A / v1**: in-process TypeScript SQLite + FTS5 candidate using the
  `ak_session_*` public contract.
- **Option B / v2**: vendored Rust `ctx-rs` engine-swap candidate using the same
  intended `ak_session_*` public contract.

Selection is pending benchmark and parity evidence. Neither candidate is the
ship decision yet.

## Feature parity matrix

| Capability | Current context tool | v1 — TS SQLite + FTS5 | v2 — Rust ctx-rs |
| --- | --- | --- | --- |
| automatic post-tool capture | shipped | shipped | planned |
| manual capture | shipped | shipped | planned |
| snapshot before compaction | shipped | shipped | planned |
| restore after compaction | shipped | shipped | planned |
| indexed command execution | shipped | shipped | planned |
| batch execution + search | shipped | partial | planned |
| fetch/index path | shipped | partial | planned |
| session search quality/fallback behavior | shipped | partial | unknown / not yet proven |
| same-repo persistence | shipped | shipped | planned |
| setup/install path | shipped | partial | planned |
| hook integration surface | shipped | partial | planned |
| supported host/runtime story | shipped | partial | unknown / not yet proven |
| packaging/distribution model | shipped | partial | blocked |
| known public contract | shipped | shipped (`ak_session_*`) | planned (`ak_session_*`) |

## Validation matrix

| Evidence area | Current context tool | v1 — TS SQLite + FTS5 | v2 — Rust ctx-rs |
| --- | --- | --- | --- |
| unit coverage | shipped | shipped | planned |
| integration coverage | shipped | partial | planned |
| hook end-to-end proof | shipped | partial | planned |
| parity fixture proof | shipped | partial | planned |
| CI gate quality | shipped | partial | planned |
| performance gate quality | shipped | partial | blocked |
| cross-platform proof | shipped | partial | unknown / not yet proven |
| package-surface truth | shipped | partial | blocked |
| docs truth | shipped | partial | planned |

## Decision matrix

| Decision factor | Current context tool | v1 — TS SQLite + FTS5 | v2 — Rust ctx-rs |
| --- | --- | --- | --- |
| feature parity score | baseline only | candidate | candidate |
| benchmark readiness | benchmark-ready | candidate | planned |
| maintenance cost | baseline only | candidate | unknown / not yet proven |
| packaging risk | baseline only | candidate | blocked |
| public-surface risk | baseline only | candidate | unknown / not yet proven |
| migration/removal complexity | baseline only | candidate | unknown / not yet proven |
| recommendation status | baseline only | candidate | candidate |

## Decision gate

The selection wave must produce a dated report that names one outcome:

1. ship v1 and park v2,
2. ship v2 and park v1, or
3. park both and keep the current context tool as the default lane-2 baseline.

Only after that decision may agent-kit remove the current context tool from its
default setup path.
