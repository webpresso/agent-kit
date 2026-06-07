---
type: blueprint
title: "wp setup: phase-aware gstack subprocess hardening"
owner: agent-kit
status: completed
complexity: S
created: '2026-06-08'
last_updated: '2026-06-08'
progress: '100% (2 of 2 tasks completed)'
depends_on: []
cross_repo_depends_on: []
tags:
  - setup
  - gstack
  - subprocess
  - observability
  - playwright
---

# wp setup: phase-aware gstack subprocess hardening

**Goal:** Keep `wp setup` quiet-by-default but never silently "look stuck" again during long external setup phases such as Playwright browser installs, cache extraction, or other upstream work that can go silent between visible output bursts.

## Planning Summary

- Goal input: `Fix the browser-install/setup hang UX elegantly, future-proof it, and align it with blueprints.`
- Complexity: `S`
- Owning boundary: `src/cli/commands/init/scaffolders/gstack/index.ts`
- External constraint: upstream gstack / Playwright behavior may stay slow, silent, or version-sensitive; agent-kit must still remain observable and bounded.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Fix boundary | agent-kit gstack wrapper | `wp setup` owns subprocess supervision, log capture, and user-facing progress semantics. |
| Upstream scope | no gstack fork in this change | Preserve the existing ownership lane; harden the wrapper around any external child, not just Playwright. |
| User feedback model | periodic quiet-mode heartbeat with last-output summary | Prevents perceived hangs without streaming raw logs or masking real inactivity timeouts. |
| Timeout model | keep inactivity timeout authoritative | Heartbeats must not reset inactivity or paper over stuck children. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1 | None | 1 agent |
| **Wave 1** | 1.2 | Task 1.1 | 1 agent |

### Phase 1: Wrapper observability + proof [Complexity: S]

#### [agent-kit] Task 1.1: Add quiet-mode heartbeat progress to the gstack runner

**Status:** done

**Depends:** None

Teach `runLoggedCommand()` to emit bounded periodic heartbeat lines while a child is still alive but quiet. The heartbeat must include elapsed time and, when available, a sanitized summary of the child's last visible output. This is explicitly for wrapper-owned observability; it must not change host-selection behavior, retry, or relax failure bounds.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/gstack/index.ts`
- Modify: `src/cli/commands/init/scaffolders/gstack/index.test.ts`

**Steps (TDD):**

1. Add failing tests that prove quiet-mode heartbeats appear for a still-running child.
2. Add failing tests that prove heartbeats do **not** reset inactivity timeout.
3. Implement heartbeat scheduling, last-output summarization, and log capture.
4. Keep verbose mode unchanged except for durable log tee behavior.

**Acceptance:**

- [x] Quiet mode emits bounded "still running" wrapper lines during silent long-running child phases.
- [x] Heartbeats include elapsed time and last-output summary when available.
- [x] Heartbeats are written to the durable session log.
- [x] Inactivity timeout semantics remain unchanged.

#### [docs] Task 1.2: Update setup guidance to describe the new observability contract

**Status:** done

**Depends:** Task 1.1

Document the refined behavior in the setup guide: quiet mode remains concise, but now emits periodic wrapper heartbeats while long external phases are still running; verbose mode remains the path for raw upstream logs; failure logs stay durable and inspectable.

**Files:**

- Modify: `docs/getting-started.md`

**Acceptance:**

- [x] Docs explain quiet-mode heartbeat behavior.
- [x] Docs keep `WP_VERBOSE_GSTACK=1` as the raw-log escape hatch.
- [x] Docs do not claim Playwright-specific behavior; they describe the generic external-command contract.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests | `vp run test:unit -- src/cli/commands/init/scaffolders/gstack/index.test.ts` | New runner tests pass |
| Type safety | `vp run typecheck` | Zero errors |
| Docs drift | `vp run docs:check` | No docs-frontmatter regressions |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Child outputs progress bars / ANSI fragments | Heartbeat preview becomes noisy | Sanitize ANSI and summarize last non-empty visible line | 1.1 |
| Child is chatty | Heartbeats become spam | Only emit heartbeats when the child has been quiet for at least one heartbeat interval | 1.1 |
| Heartbeat loop masks a real stall | Setup never fails | Heartbeats must not refresh inactivity timers | 1.1 |

## Non-goals

- Changing upstream gstack setup logic.
- Special-casing Playwright cache state or browser artifacts.
- Raising inactivity thresholds to hide slow or stuck child behavior.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Heartbeat phrasing becomes too noisy | Setup output regresses | Keep messages short, periodic, and quiet-mode only |
| Last-output parsing misses progress-only chunks | Heartbeat lacks context | Fall back to elapsed + silence age without failing the run |
