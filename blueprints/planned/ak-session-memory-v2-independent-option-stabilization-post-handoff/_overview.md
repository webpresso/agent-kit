---
type: blueprint
title: session-memory v2 — independent option stabilization post-handoff
owner: agent-kit
status: planned
complexity: L
created: '2026-06-12'
last_updated: '2026-06-12'
progress: '0% — deferred until explicit handoff/ownership'
depends_on:
  - ak-session-memory-v1-independent-option-hardening-and-truth-alignment
tags:
  - session-memory
  - v2
  - rust
  - ctx-rs
  - handoff
  - lane-2
---

# session-memory v2 — independent option stabilization post-handoff

## Locked framing

v2 is a separate replacement candidate for the current context tool. It is not
“v1 plus polish” and it is not the automatic next step after v1. It has its own
delivery burden, proof burden, and PR narrative.

## Ownership gate

No implementation starts until handoff/ownership is explicit. The first action
after handoff is to reconcile public PR #95 with the unpublished continuation
branch `feat/ak-session-memory-v2-rebased-onto-main` at
`afd01a03609c201e0c157355bac16542337fe270`.

## First wave

- Diff public PR #95 head against the continuation head.
- Isolate Rust/session-memory changes from unrelated repo churn.
- Update PR #95 title/body immediately to say it is an independent v2 candidate.
- Preserve in-progress status until correctness, parity, packaging, and perf
  proof exists.

## Completion scope

- Fix correctness blockers.
- Prove schema parity with the v1 public `ak_session_*` contract.
- Add real Rust tests and parity fixtures.
- Make the performance gate real, not aspirational.
- Prove or narrow host/runtime support.
- Update docs/matrix cells with evidence-based statuses only.

## Acceptance criteria

- PR #95 narrative distinguishes candidate implementation from benchmark
  selection and removal/cutover work.
- Rust tests exist and run.
- Parity proof exists for every claimed lane-2 capability.
- Performance gate produces comparable evidence.
- Matrix/doc cells are truthful and dated.
