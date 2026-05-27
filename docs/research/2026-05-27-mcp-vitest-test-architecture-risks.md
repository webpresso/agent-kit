---
type: research
title: "MCP/Vitest Test Architecture Risks After Blueprint-Server Split"
subject: "Other MCP/Vitest test architecture risks after the blueprint-server split"
date: 2026-05-27
last_updated: 2026-05-27
confidence: high
verdict: assess
---

# MCP/Vitest Test Architecture Risks After Blueprint-Server Split

> The blueprint-server split is sound, but adjacent stale MCP tests and large serial suites remain the highest-confidence risks.

## TL;DR

- The strongest external evidence still supports the current direction: split expensive Vitest suites by file, preserve isolation, and avoid `test.concurrent` as a shortcut.
- Repo evidence found two adjacent failing MCP test files with stale assumptions: registration cold-start behavior and aggregate missing-DB behavior. Follow-up implementation repaired those assumptions and added targeted passing evidence.
- A second adjacent risk was in-test wall-clock assertions. Those assertions are now removed from the directly touched MCP/blueprint contract tests; bounded `wp_test` batches are the timing guard.
- Large tests elsewhere are risks, but not all are proven bottlenecks; timing evidence is required before splitting them.
- 100% confidence is not achievable from finite static and sampled test evidence. Confidence is high for the directly observed failures and medium for broader risk ranking.
- Recommendation: assess and repair the adjacent MCP stale tests next, then add small architecture guards only where a pattern has already failed.

## What This Is

This report researches other risks similar to the blueprint-server timeout and determinism issue. It combines 2026-current Vitest documentation, flaky-test research, practitioner sentiment, and repo-local evidence from the Agent-Kit MCP/blueprint test surfaces.

## State of the Art (2026)

Vitest’s current model strongly favors file-level parallelism for speed. The official parallelism guide says Vitest runs test files in parallel by default, while tests inside one file are sequential unless explicitly marked concurrent. It also clarifies that concurrent tests stay in the same worker as their file, so `.concurrent` is not a worker-scaling substitute ([Vitest Parallelism](https://main.vitest.dev/guide/parallelism), official, high credibility).

Vitest’s performance guide allows disabling isolation, but frames it as a trade-off for projects that clean up state reliably. That is a poor default for env-stubbing, filesystem, SQLite, module-mocking, and MCP registration tests in this repository ([Vitest Improving Performance](https://main.vitest.dev/guide/improving-performance.html), official, high credibility).

Vitest’s lifecycle docs reinforce why module-level state is risky: setup files run per test file, but imported modules can be cached when isolation is disabled, and test execution order has configurable behavior ([Vitest Lifecycle](https://vitest.dev/guide/lifecycle), official, high credibility).

Google’s testing guidance and research emphasize that flakiness often comes from invalid assumptions about time, test data, cleanup, ordering, resources, and external dependencies. Larger tests are also more likely to be flaky ([Google Test Flakiness](https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html), [Where do our flaky tests come from?](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html), high credibility).

Recent JavaScript flaky-test research supports the same concern: order-dependent flaky tests are a meaningful JavaScript risk and require explicit detection rather than assumption ([Detecting and Evaluating Order-Dependent Flaky Tests in JavaScript](https://arxiv.org/abs/2501.12680), academic, medium-high credibility).

## Positive Signals

### The main blueprint-server fix matches upstream architecture

- File splitting matches Vitest’s strongest speed lever: file-level worker parallelism ([Vitest Parallelism](https://main.vitest.dev/guide/parallelism), official).
- Keeping global isolation avoids the correctness/performance trade-off Vitest warns about when disabling isolation ([Vitest Improving Performance](https://main.vitest.dev/guide/improving-performance.html), official).
- The added `src/mcp/blueprint-server.test-architecture.test.ts` turns the lesson into an automated guard rather than tribal memory.

### Repo verification has a strong signal for the touched surface

- Fresh `wp_test` on the 8-file blueprint-server target passed under a 45s cap.
- Touched MCP TS lint, typecheck, blueprint lifecycle audit, docs-frontmatter audit, agent audit, and testing-philosophy audit all passed during verification.
- Source scans found no production imports of `blueprint-server.test-harness.ts`, no TypeScript suppressions in touched files, and no global `isolate: false` change.

### The local vision favors this kind of hardening

- `VISION.md` describes Agent-Kit as canonical Webpresso agent tooling with calm defaults and quality gates.
- Test architecture guards align with that vision because they make the fast path reliable for agents and humans without requiring users to know Vitest internals.

## Negative Signals

### Adjacent MCP stale tests were already failing, now mitigated

Repo-local evidence found two directly failing adjacent files:

- `src/mcp/blueprint-server.registration.test.ts` fails because it expects `registerBlueprintTools()` to call `coldStartIfNeeded()` and re-ingest stale projections during registration.
- `src/mcp/blueprint-workflow.integration.test.ts` fails because it expects missing aggregate DBs to surface as failures, while current aggregate reads call `ensureProjectionReady()` and can lazily create missing projections.

This is the same contract family as the hardened blueprint-server work: registration should be lightweight, missing DBs may be lazily created, and stale DBs should remain explicit.

Follow-up implementation changed these tests to assert the hardened contract instead:

- `registerBlueprintTools()` registers tools without creating/refreshing projections.
- Aggregate reads isolate stale projects as `next_action.kind: "reingest_project"`.
- Missing projection DBs are not treated as aggregate failures when lazy creation succeeds.
- Timing-sensitive contract tests no longer contain local `Date.now()` budget assertions; timing is captured through `wp_test` batch results.

Verification evidence after mitigation:

- `wp_test` on registration + workflow tests with `timeoutMs: 45000`: pass, 16.10s.
- `wp_test` on registration/workflow/projects/project-resolver/validation/fixture tests with `timeoutMs: 45000`: pass, 27.23s.
- `wp_qa` on the adjacent touched files: pass, 19.42s.

### Large serial tests remain in the repository

The scan found several very large test files:

- `src/audit/repo-guardrails.test.ts` — 1741 lines.
- `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` — 1647 lines.
- `src/blueprint/core/parser.test.ts` — 1634 lines.
- `src/blueprint/lifecycle/audit.test.ts` — 1437 lines.
- `src/blueprint/dag/executor.test.ts` — 1287 lines.

Google’s data suggests larger tests correlate with more flakiness ([Where do our flaky tests come from?](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html), high credibility), but line count alone does not prove current timeout risk. These should be measured before any split.

### Timing and wait anti-patterns are present in some areas

The scan found timeout/wait patterns in tests such as:

- `src/blueprint/dag/executor.test.ts`
- `src/blueprint/db/concurrent-ingest.integration.test.ts`
- `src/blueprint/db/paths.test.ts`
- `src/cli/auto-update/installer.integration.test.ts`
- `src/config/launch/dev-contracts.test.ts`
- `src/mcp/blueprint-workflow.integration.test.ts`

Research on asynchronous wait flaky tests shows developers often respond by adapting wait times even when the root cause is elsewhere, which can hide design issues ([Time-based Repair for Asynchronous Wait Flaky Tests in Web Testing](https://arxiv.org/abs/2305.08592), academic, medium-high credibility).

### Retry/quarantine practices can mask rather than solve

Industry and practitioner sources agree retries can help classify noise, but they should be capped, logged, and treated as diagnostic evidence rather than a substitute for root-cause repair ([QA Wolf](https://www.qawolf.com/blog/what-your-system-should-do-with-a-flaky-test), practitioner, medium credibility; [De-Flake Your Tests](https://storage.googleapis.com/gweb-research2023-media/pubtools/6478.pdf), Google research, high credibility).

## Community Sentiment

Practitioner sentiment is consistent: flaky tests erode trust, and shared state plus parallel execution are frequent suspects.

- QA Wolf recommends capped retries with metadata and failure signatures, not unbounded reruns ([QA Wolf](https://www.qawolf.com/blog/what-your-system-should-do-with-a-flaky-test), medium credibility).
- TechTarget’s 2025 guidance calls out asynchronous calls, race conditions, leaked state, stale data, time-based scenarios, infrastructure, and third-party systems as common causes ([TechTarget](https://www.techtarget.com/searchsoftwarequality/tip/Why-flaky-tests-are-a-problem-you-cant-ignore), medium credibility).
- Recent Reddit/Hacker News threads skew toward the same operational diagnosis: parallel CI failures often indicate shared state, timing assumptions, or environment dependencies rather than “random” flakes ([Reddit softwaretesting](https://www.reddit.com/r/softwaretesting/comments/1on5qee), [Hacker News selective testing discussion](https://news.ycombinator.com/item?id=42517163), community, medium-low credibility).

The sentiment is not “never parallelize.” It is “parallelize with isolation and clean state.”

## Project Alignment

### Vision Fit

This work aligns strongly with Agent-Kit’s vision as the canonical Webpresso agent tooling layer. Reliable, bounded verification supports calm defaults, quality gates, and agent-friendly workflows.

The adjacent stale tests are a vision risk because agents may interpret them as product regressions when they are actually outdated contract assumptions.

### Tech Stack Fit

The repo uses TypeScript, Vitest, Zod, SQLite-backed blueprint projections, MCP tools, and wrapped `wp_*` verification. The best-fit approach is:

- keep Vitest file parallelism,
- preserve default isolation,
- use explicit temp repos/projection fixtures,
- guard architecture invariants with small tests,
- use `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, and `wp_audit` as the verification surface.

### Trade-offs for Current Stage

- Splitting every large test file now would be speculative and may add maintenance overhead.
- Fixing already failing adjacent MCP tests is not speculative; it is directly supported by fresh evidence.
- Architecture guards are worth adding only when they protect a failure mode already observed, as with blueprint-server.

## Recommendation

Verdict: **assess**.

Recommended next action:

1. Fix `src/mcp/blueprint-server.registration.test.ts` to match the current lightweight registration contract.
2. Fix `src/mcp/blueprint-workflow.integration.test.ts` to distinguish missing-DB lazy creation from stale-DB failure behavior.
3. Measure, but do not automatically split, the very large non-MCP test files.
4. Add architecture guards only for high-confidence regressions: monolithic blueprint-server reintroduction, timeout-literal shortcuts, production imports of test harnesses, and missing-vs-stale projection conflation.

Confidence:

- **High** for the two adjacent MCP stale-test risks because `wp_test` failed directly and the implementation evidence explains why.
- **Medium** for broader large-file risks because line count and external research are warning signs, not proof of current failure.
- **Not 100%** because exhaustive certainty would require repeated full-suite runs under varied order, worker count, OS load, and CI conditions. The available evidence is strong, but finite.

## Sources

1. [Vitest Parallelism](https://main.vitest.dev/guide/parallelism) — official docs, high credibility, positive toward file-level splitting.
2. [Vitest Improving Performance](https://main.vitest.dev/guide/improving-performance.html) — official docs, high credibility, mixed on isolation changes.
3. [Vitest Test Run Lifecycle](https://vitest.dev/guide/lifecycle) — official docs, high credibility, neutral.
4. [Vitest Features](https://main.vitest.dev/guide/features.html) — official docs, high credibility, neutral on `.concurrent` mechanics.
5. [Google Testing Blog: Test Flakiness](https://testing.googleblog.com/2020/12/test-flakiness-one-of-main-challenges.html) — engineering blog, high credibility, negative on unaddressed flakes.
6. [Google Testing Blog: Where do our flaky tests come from?](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html) — engineering blog with data, high credibility, negative on large/flaky tests.
7. [Google Testing Blog: Hermetic Servers](https://testing.googleblog.com/2012/10/hermetic-servers.html) — engineering blog, high credibility, positive toward hermetic isolation.
8. [Detecting and Evaluating Order-Dependent Flaky Tests in JavaScript](https://arxiv.org/abs/2501.12680) — academic, medium-high credibility, negative on order dependence.
9. [Time-based Repair for Asynchronous Wait Flaky Tests in Web Testing](https://arxiv.org/abs/2305.08592) — academic, medium-high credibility, negative on wait/time flakiness.
10. [QA Wolf: How to Handle Flaky Tests](https://www.qawolf.com/blog/what-your-system-should-do-with-a-flaky-test) — practitioner guidance, medium credibility, mixed on retries as diagnostics.
11. [TechTarget: How to fix flaky tests](https://www.techtarget.com/searchsoftwarequality/tip/Why-flaky-tests-are-a-problem-you-cant-ignore) — practitioner guidance, medium credibility, negative on unmanaged flakes.
12. [De-Flake Your Tests](https://storage.googleapis.com/gweb-research2023-media/pubtools/6478.pdf) — Google research paper, high credibility, negative on flakes as workflow noise.
13. [Reddit: concurrent CI database-state isolation discussion](https://www.reddit.com/r/softwaretesting/comments/1on5qee) — community anecdote, medium-low credibility, negative on shared DB state.
14. [Hacker News: Faster CI with Selective Testing](https://news.ycombinator.com/item?id=42517163) — community discussion, medium-low credibility, mixed on selective testing.
