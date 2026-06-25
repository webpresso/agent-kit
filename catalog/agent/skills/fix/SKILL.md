---
type: skill
slug: fix
title: Fix
status: active
scope: repo
applies_to: [agents]
related: [verify, systematic-debugging, test-driven-development]
created: "2026-05-13"
last_reviewed: "2026-05-22"
name: fix
description: Root-cause fix workflow for debugging and implementation. Use when the user asks to fix an issue, bug, failing test, error, broken behavior, or asks for `/fix <target>` / `$fix <target>`. Enforces root-cause analysis, minimal correct changes, regression tests, and scoped verification before claiming done.
argument-hint: '<target> where target is: file|symptom|error|test|"free-text description"'
---

# Fix Command

Fix the issue at its root, future-proof, aligned with repo philosophy.

**Arguments**: $ARGUMENTS

This command turns "please fix it well" into an enforceable workflow: reproduce, identify the broken invariant, repair it at the owner, prove the repair, and escalate to `/verify` when the blast radius is broader than a local fix.

## Non-negotiable invariants

1. **Root cause, not symptom.** Trace the failure to the invariant that actually broke. Do not patch callers when the owner is fixable.
2. **Loud failures, no silent fallbacks.** No default shims, sentinel returns, or catch-and-continue behavior that hides missing config, bad state, or broken boundaries.
3. **Use the repo's real execution surface.** Prefer repo-owned wrappers and injected routing guidance over host-specific tool assumptions. If the repo exposes quality wrappers, use them. Use bounded inspection paths for large-output investigation.
4. **Regression proof is mandatory.** Add or strengthen a test or other reliable proof that would fail against the old behavior.
5. **Raising timeouts is not a fix.** If a timeout fires, investigate the bottleneck. Only raise a bound when the repo already documents that workload and you can cite measurement.
6. **Zero suppressions, zero papering over.** No lint disables, ts-ignore, compat aliases, or "temporary" branches to sneak the fix through.
7. **Minimal correct diff.** Update every consumer of a changed contract in the same change, but do not bundle unrelated cleanup.

## Protocol

### Step 1 — Reproduce and name the broken invariant

- Run the exact command, test, or user flow that surfaces the failure.
- Capture the evidence that matters: error text, file:line, exit code, failing assertion, or log path.
- Read enough surrounding code to say the broken invariant in one sentence.
- If the issue is nondeterministic, gather evidence until you can describe the slow/flaky/failing case without guessing.

If the "issue" is actually several unrelated failures, stop and ask which one to fix first.

### Step 2 — Decide where the fix belongs

State briefly:

- the broken invariant
- the owner that should enforce it
- whether the fix changes a public contract
- which direct consumers must change in the same diff

If the blast radius is broader than the owner + direct consumers, keep going with `/fix` only if the change is still one coherent repair. If the work becomes a broader hardening pass, plan a `/verify` handoff before claiming done.

### Step 3 — Write failing proof first when feasible

- For a reproducible bug, write or strengthen the smallest regression test that fails on the old behavior.
- Verify that it fails for the right reason before changing production code.
- If test-first is genuinely infeasible at that boundary, record why and create the nearest reliable proof instead (for example a deterministic integration reproduction, fixture, or logged command).

Do not keep production code written before the test as "reference". If you wrote code first, throw it away and restart from the failing proof.

### Step 4 — Implement the minimal correct fix

- Edit the file or module that owns the invariant.
- Update every changed consumer in the same diff. No half-migrations.
- Delete compat shims, dead aliases, and TODO branches made obsolete by the repair.
- Keep complexity down by extracting helpers instead of nesting conditionals.

### Step 5 — Run scoped verification

Run the narrowest checks that prove the repaired behavior on the real repo surface:

- targeted test(s) for the repaired path
- targeted lint/typecheck/build checks for changed files or packages
- any boundary-specific verification the repo requires for the touched surface

Rules:

- Prefer repo-owned wrappers or routed quality tools over raw host-specific commands.
- Reuse fresh logs if the repo auto-saves them; do not re-run long commands just to re-read output.
- Read the exit code and summary before making a claim.

Escalate to `/verify <target>` when any of these are true:

- the fix crosses packages
- the fix changes a public or shared contract
- the fix touched docs, plans, blueprints, or repo SSOT
- the fix needs dead-code / compat / broad regression review before claiming done

### Step 6 — Report with evidence

Keep it short:

- what invariant broke
- how the change restores it
- what proof ran (tests, commands, log paths, exit codes)
- adjacent issues noticed but intentionally not fixed

## Done looks like

- [ ] Root cause named in one sentence
- [ ] Fix applied at the owning boundary
- [ ] Regression proof fails against the old behavior
- [ ] Minimal code change restores the invariant
- [ ] Scoped verification passed on the changed surface
- [ ] `/verify` handoff used when blast radius exceeded a local fix
- [ ] Report cites evidence, not intent

## Anti-patterns this command refuses

- Fixing the nearest symptom while leaving the real invariant broken
- Catching an error and returning a sentinel to "keep things moving"
- Raising a timeout, retry count, or polling interval instead of finding the bottleneck
- Adding a deprecated alias instead of updating consumers
- Introducing `any`, suppressions, or lint disables to unblock the fix
- Bundling unrelated refactors with the repair
- Claiming done from intuition, partial output, or another agent's success message
- Writing a planning/doc artifact when the user asked for a fix
