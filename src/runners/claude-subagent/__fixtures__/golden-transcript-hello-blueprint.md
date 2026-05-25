---
type: blueprint
title: hello world (Task 0.0 baseline-capture fixture)
status: in-progress
complexity: XS
created: '2026-05-11'
last_updated: '2026-05-11'
tags:
  - fixture
  - runner-baseline
  - golden-transcript
---

# Hello world (golden-transcript fixture)

**This blueprint is a fixture, not a real planned work item.** It is the
INPUT for the `claude-subagent` Runner iron-rule regression test. The
capture script at `scripts/capture-pll-baseline.ts` runs this blueprint
through the pre-abstraction `pll` flow and persists the observed
RunnerEvent stream + final diff as
`golden-transcript-hello.json` alongside this file.

Task 4.1 then loads that JSON fixture, feeds the same input through the
new `claude-subagent` Runner with the subagent invocation mocked to
replay the captured turns, and asserts the resulting RunnerEvent stream
matches the fixture byte-identically (modulo timestamps).

If a future change to this blueprint's body is required for
regeneration, re-run the capture script and commit both the updated MD
and the regenerated JSON together.

## Product wedge anchor

Not applicable — this is a test fixture.

## Why this exists

Provides a minimal, deterministic input for the iron-rule baseline
capture. Chosen properties:

- Single task, single file change — no parallel-task ordering effects.
- File creation + matching test — exercises the two most common
  observable behaviors (write a source file, write a test file).
- No external network dependency.
- No environment-dependent paths.
- Deterministic exports (`hello()` returns a constant string).

## Goals

- Add `src/hello.ts` exporting a single function `hello(): string` that
  returns `'hello, webpresso'`.
- Add a matching `src/hello.test.ts` that asserts the return value
  exactly via `toStrictEqual` (no weak assertions per the webpresso
  testing convention).
- `pnpm test src/hello.test.ts` exits 0.

## Non-goals

- Performance optimization.
- Edge case handling beyond a single deterministic input.
- TypeScript generics or type tricks.

## Tasks

### Wave 0 — Single task (no deps)

#### [src] Task 0.1: Add hello.ts + hello.test.ts

**Status:** todo
**Depends:** None

Create `src/hello.ts` with a single exported function `hello()` that
returns the literal string `'hello, webpresso'`. Add a colocated
`src/hello.test.ts` asserting the return value via `toStrictEqual`.

**Files:**
- Create: `src/hello.ts`
- Create: `src/hello.test.ts`

**Steps (TDD):**
1. Write `hello.test.ts`:
   ```ts
   import { describe, expect, it } from 'vitest'
   import { hello } from './hello'

   describe('hello', () => {
     it('returns the deterministic greeting', () => {
       expect(hello()).toStrictEqual('hello, webpresso')
     })
   })
   ```
2. `pnpm test src/hello.test.ts` — verify FAIL (module not found).
3. Write `hello.ts`:
   ```ts
   export function hello(): string {
     return 'hello, webpresso'
   }
   ```
4. `pnpm test src/hello.test.ts` — verify PASS.
5. `vp run lint -- src/hello.ts src/hello.test.ts` — verify clean.

**Acceptance:**
- [ ] `src/hello.ts` exists with the documented signature.
- [ ] `src/hello.test.ts` exists with the strict-equality assertion.
- [ ] Test passes; lint passes.

## Quick Reference

| Wave | Tasks | Dependencies |
|---|---|---|
| Wave 0 | 0.1 | None |

Total tasks: 1. Critical path: 1 wave.

## Acceptance for the fixture

- This blueprint exists at its canonical path
  (`src/runners/claude-subagent/__fixtures__/golden-transcript-hello-blueprint.md`).
- Capture script can run it through pre-abstraction `pll` and produce
  a deterministic JSON transcript.
- Captured JSON committed alongside this file as
  `golden-transcript-hello.json`.
