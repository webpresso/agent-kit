---
type: skill
slug: verify
title: Verify
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-22'
name: verify
description: Post-implementation quality gate that verifies work is actually done, cleans up legacy/backward-compat/dead-code garbage left behind, and refreshes affected docs. Use after implementing a feature or fix, before claiming done, or when finalizing a blueprint. Triggers on `/verify <target>`, `verify this work`, `is this really done?`, or when a human asks for post-implementation review.
argument-hint: '<target> [--full] where target is: package|file|plan-slug|all'
hooks:
  Stop:
    - command: wp audit agents
      timeout: 20
---

# Verify

Post-implementation quality gate. Run after implementation exists, before claiming `done`.

`/fix` owns reproduction, root-cause analysis, and the minimal repair. `/verify` owns the broader question: **is this work actually complete, integrated, and free of stale garbage?**

## Iron law — evidence before claims

No completion claim without fresh verification evidence.

Before saying `done`, `fixed`, `passes`, or `clean`:

1. Identify the command or log that proves the claim.
2. Run it now, or cite the fresh log from the just-completed run.
3. Read the exit code and summary — do not infer from partial output.
4. State the actual result, including the log path when the repo records one.
5. If another agent made the change, inspect the diff yourself before repeating the claim.

Not sufficient: "should pass", "looks correct", lint-only evidence for runtime claims, or another agent's success report without independent verification.

## Usage

```bash
/verify <target>
/verify <target> --full
```

`<target>` is a file path, package name, blueprint slug, or `all`.

Follow the repo's current routing and command surface:

- use repo-owned quality wrappers first
- use injected quality-tool routing when present
- use bounded large-output tooling when the repo instructs it
- reuse fresh logs instead of re-running broad commands just to inspect output

## Phase 0 — Scope and evidence map

1. Identify target type (file / package / blueprint slug / all).
2. Map each claim you plan to make to the exact command or log that proves it.
3. If the target is a blueprint slug, run the repo's blueprint show/audit surface and record the acceptance boxes that still need proof.

## Phase 1 — Governance gates

Run only the gates that apply to the diff:

- repo SSOT / schema / config changes → the repo's dedicated check
- docs or markdown changes → the repo's docs / markdown validation surface
- blueprint target → the repo's blueprint audit surface
- agent-surface / catalog changes → the repo's agent or catalog audit surface

Hard stop on any failure.

## Phase 2 — Surface verification

Run the narrowest checks that prove the touched behavior:

- targeted lint
- targeted typecheck
- targeted tests
- build / e2e / package checks only when the change requires them

Rules:

- Prefer repo wrappers over raw underlying tools.
- Reuse fresh logs if the runner auto-saves them.
- Never claim broader correctness than the commands actually proved.
- If the repo documents a "full QA" bookend, reserve it for the final broad pass rather than every iteration.

## Phase 3 — Cross-surface impact scan

Ask:

- Did the change alter a public/shared export, type, config shape, command, or generated surface?
- Do consumers, mocks, fixtures, or docs still reference the old shape?
- Does another package, blueprint, or agent surface need to be updated in the same change?

Hard stop if a shared contract changed and consumers were not updated.

## Phase 4 — Test quality and behavioral audit

The passing test suite is necessary, not sufficient.

Check that:

- the new or changed tests would fail against the old behavior
- mocks stay at real external boundaries
- assertions prove the intended behavior rather than incidental implementation details
- mixed/partial/error-path coverage exists where the feature demands it
- UX or operator-facing flows include graceful-degradation coverage when applicable

If the repo has a testing-philosophy or E2E audit surface, run it when the change touches that layer.

## Phase 5 — Complexity, compatibility, and dead-code sweep

Before claiming done:

- remove stale compat aliases and "temporary" branches introduced by the change
- verify no suppressions were added
- verify no production `any` slipped in except an explicitly allowed repo test idiom
- justify every new exported/helper surface with a real consumer or test
- run the repo's dead-code / dependency checks when the change broadened public surface or added new files

This phase exists to catch the garbage that often slips in beside otherwise-correct work.

## Phase 6 — Final completion statement

Report:

- what was verified
- which commands/logs prove it
- what remains intentionally out of scope

If any required check is missing, the correct result is **not done yet**, not a softer claim.
