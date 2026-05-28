---
type: research
title: "wp setup gstack efficiency"
subject: "Reducing wp setup latency and improving progress UX around gstack setup"
date: 2026-05-28
last_updated: 2026-05-28
confidence: high
verdict: trial
---

# wp setup gstack efficiency

> `wp setup` is slow mostly because the gstack preset delegates to upstream `./setup --host auto --team`, which expands to every detected host and emits unbounded generator output.

## TL;DR

- The highest-leverage fix is to stop using upstream gstack `--host auto` as the default from `wp setup`; use an explicit host policy so incidental `factory`/`opencode` binaries do not trigger extra skill-doc generation.
- Preserve user trust by replacing raw upstream output with bounded progress events, durations, and a verbose/debug log path.
- Keep a safe escape hatch: `WP_SKIP_GSTACK=1` already exists; add a less blunt `WP_GSTACK_HOSTS`/`WP_GSTACK_MODE=fast|full` contract.
- Recommended verdict: **trial** a fast default that configures only required surfaces, with full multi-host setup opt-in.

## What This Is

This research investigates why `wp setup` can spend 5-10 minutes in gstack setup and how to make the setup path faster, more predictable, and more elegant without removing gstack as an integration lane.

## State of the Art (2026)

Current CLI guidance favors:

- human-readable progress only on interactive terminals, with no animations in non-TTY/CI contexts ([Command Line Interface Guidelines](https://clig.dev/), high credibility);
- hidden or summarized noisy logs on success, but full logs available on failure ([Command Line Interface Guidelines](https://clig.dev/), high credibility);
- machine-readable output and typed errors for tool/agent consumers ([CLI Spec](https://clispec.dev/), medium-high credibility);
- cache-aware install paths and lockfile-protected installs ([Bun install docs](https://bun.com/docs/pm/cli/install), high credibility);
- avoiding unnecessary network/object transfer for repository bootstraps ([Git clone docs](https://git-scm.com/docs/git-clone.html), [Git partial clone docs](https://git-scm.com/docs/partial-clone.html), high credibility).

## Positive Signals

### Fast-paths are already available locally

- `wp setup` already has `WP_SKIP_GSTACK=1`; the code path is explicit at `src/cli/commands/init/index.ts:596-604`.
- The local gstack wrapper already owns the checkout/bootstrap seam in `src/cli/commands/init/scaffolders/gstack/index.ts`, making it the right place to add host policy and output shaping.
- gstack upstream supports explicit hosts (`claude`, `codex`, `factory`, `opencode`, `auto`) and quiet mode in its `setup` script ([gstack setup](https://raw.githubusercontent.com/garrytan/gstack/main/setup), high credibility).

### Upstream gstack is broadly idempotent

- Existing setup uses `git pull --ff-only`, smart build checks for the browse binary, and cached `bun install --frozen-lockfile` paths.
- Bun supports lockfile enforcement and output/logging controls such as `--silent`, `--no-progress`, and `--no-summary` ([Bun install docs](https://bun.com/docs/pm/cli/install), high credibility).
- Bun’s global virtual store is designed to avoid repeated full dependency materialization across checkouts ([Bun global virtual store](https://bun.com/docs/pm/global-store), high credibility).

## Negative Signals

### `--host auto` over-installs

- Upstream gstack `auto` detects all installed host CLIs: `claude`, `codex`, `kiro-cli`, `droid`/Factory, and `opencode` ([gstack setup](https://raw.githubusercontent.com/garrytan/gstack/main/setup), high credibility).
- Your captured run shows `.agents`, `.factory`, and `.opencode` skill docs generated, including three token-budget reports of roughly 740k-764k tokens each. That is strong evidence of over-broad host fan-out.
- Agent-kit currently calls `./setup --host auto --team` whenever Codex is detected (`src/cli/commands/init/scaffolders/gstack/index.ts:76-88, 136`), so any incidental Factory/OpenCode binary on `PATH` expands the work.

### Output is noisy but not diagnostic

- The generated skill-file list and token budget dominate the terminal, but they do not tell the user which bounded phase is running, what is optional, or how long remains.
- CLI guidance explicitly warns that creator-oriented output should not be default user output and that hidden logs must be recoverable on error ([Command Line Interface Guidelines](https://clig.dev/), high credibility).
- The current wrapper uses `spawnSync(..., { stdio: 'inherit' })`, so agent-kit cannot summarize, redact, time, or classify upstream output (`src/cli/commands/init/scaffolders/gstack/index.ts:83-90`).

### Slowness is structural, not just network

- `git pull` was already up to date in the reported run, and `bun install` checks were ~1s or less for each host generation. The visible cost is repeated generation and token-budget reporting, not dependency download.
- gstack upstream intentionally regenerates `.agents` every setup and conditionally regenerates `.factory`/`.opencode` when those hosts are detected ([gstack setup](https://raw.githubusercontent.com/garrytan/gstack/main/setup), high credibility).

## Community Sentiment

- CLI best-practice communities consistently treat silent or opaque long-running commands as trust-eroding, but also warn against progress bars in CI/non-TTY logs. The consensus pattern is “interactive summary/progress + full verbose logs on demand.”
- Git and Bun official docs reinforce the same operational pattern: make network/install work cache-aware, quiet by default when requested, and explicit about progress/logging modes.

## Project Alignment

### Vision Fit

Agent-kit’s package description promises one command that shares context, hooks, and quality gates across AI coding agents. A 5-10 minute setup with accidental multi-host generation undermines that “one command” promise by making first-run setup feel hung and by coupling one host’s setup to unrelated host binaries.

### Tech Stack Fit

The repo is TypeScript/Vitest/Zod, with `vp` scripts and existing scaffolders/tests around `src/cli/commands/init/`. The best fit is a small TypeScript wrapper improvement plus focused Vitest coverage, not a new dependency.

### Trade-offs for Current Stage

- **Fast default** improves perceived quality immediately but risks not refreshing every possible host surface.
- **Full default** preserves broad behavior but continues punishing users who happen to have Factory/OpenCode installed.
- **Recommended compromise:** fast default for active/required hosts, full multi-host opt-in via env/flag, and explicit setup summary that tells users what was skipped.

## Recommendation

### Direct Recommendation

Trial a three-part fix:

1. **Host policy:** replace unconditional `--host auto` with an agent-kit host policy:
   - default: `codex` when Codex is detected from a Codex-oriented setup path;
   - preserve Claude/team hook if required;
   - opt in to all hosts with `WP_GSTACK_MODE=full` or `WP_GSTACK_HOSTS=auto`;
   - allow explicit `WP_GSTACK_HOSTS=codex,claude` for reproducible local setup.
2. **Output policy:** do not stream raw gstack generator logs by default. Emit bounded phases:
   - `gstack: update checkout`;
   - `gstack: setup host(s)=codex`;
   - `gstack: link skills`;
   - `gstack: done in Ns`;
   - `gstack: wrote verbose log to ...` only on warning/failure or with `WP_VERBOSE_GSTACK=1`.
3. **Upstream follow-up:** propose a gstack-side `--hosts claude,codex` or `GSTACK_SKIP_HOSTS=factory,opencode` flag so wrappers do not need PATH hacks.

### Why this should work

The reported setup generated three large host surfaces. Removing Factory/OpenCode from the default path should eliminate two whole `gen:skill-docs` passes and two token-budget reports, which is the dominant visible gstack work in the captured output.

## Candidate Implementation Plan

1. Add `resolveGstackHostPolicy()` in `src/cli/commands/init/scaffolders/gstack/index.ts`.
2. Support env:
   - `WP_GSTACK_MODE=fast|full`;
   - `WP_GSTACK_HOSTS=auto|codex|claude|codex,claude`;
   - `WP_VERBOSE_GSTACK=1`.
3. Change tests in `src/cli/commands/init/scaffolders/gstack/index.test.ts` to prove:
   - default Codex path does not call `--host auto`;
   - full mode still calls `--host auto --team`;
   - invalid host env fails early with a clear warning or falls back safely.
4. Add a bounded-log runner or, as a smaller first pass, print phase/duration messages before and after the existing `spawnSync`.
5. Add a regression test around `wp setup` output shape if there is an existing init integration harness that can stub the gstack spawn.

## Best-Practice Research: setup efficiency and progress UX

### Direct Recommendation

Make setup work explicit, minimal, and resumable. Use a fast default, cache aggressively, and show progress as phase state rather than unfiltered subtool logs.

### Evidence Used

- Official/upstream: [gstack setup](https://raw.githubusercontent.com/garrytan/gstack/main/setup) — establishes host auto-detection, always-regenerated `.agents`, conditional `.factory`/`.opencode`, and quiet flag.
- Official/upstream: [Bun install docs](https://bun.com/docs/pm/cli/install) — establishes lockfile, cache, output/logging, and concurrency controls.
- Official/upstream: [Bun global virtual store](https://bun.com/docs/pm/global-store) — establishes shared install cache strategy.
- Official/upstream: [Git clone docs](https://git-scm.com/docs/git-clone.html) — establishes progress/quiet behavior and partial clone filter flag.
- Official/upstream: [Git partial clone docs](https://git-scm.com/docs/partial-clone.html) — establishes reducing transfer/disk by avoiding unnecessary objects.
- Official/upstream: [Node child_process docs](https://nodejs.org/api/child_process.html) — establishes process lifecycle and stdio control surface for a bounded runner.
- Standard/guideline: [Command Line Interface Guidelines](https://clig.dev/) — establishes TTY-aware progress, verbose-mode logs, and recoverability.
- Standard/guideline: [CLI Spec](https://clispec.dev/) — establishes machine-readable output/error expectations for agent consumers.

### Version / Date Context

Research date: 2026-05-28. Git clone docs were current to 2.54.0 on 2026-04-20. Node docs fetched as v26.2.0. Bun docs were current as fetched on 2026-05-28. gstack source was fetched from `main`, so exact behavior may drift.

### Repo-Local Context

- `wp setup` defaults include `gstack` (`src/cli/commands/init/index.ts:75-85`).
- `WP_SKIP_GSTACK=1` exists (`src/cli/commands/init/index.ts:596-604`).
- Current gstack wrapper calls `git pull --ff-only origin main` and then `./setup --host auto --team` when Codex is detected (`src/cli/commands/init/scaffolders/gstack/index.ts:136, 170-181`).
- Existing tests assert `--host auto --team`, so changing policy needs test updates (`src/cli/commands/init/scaffolders/gstack/index.test.ts:67-92`).

### Boundaries / Non-goals

This research does not decide whether agent-kit should depend on gstack long-term. It only optimizes the current integration path. It also does not require raising timeouts; timeout increases would mask the root cause.

### Handoff

Implement as a small scaffolders/gstack change with targeted tests first. If the fast default risks host parity, gate it behind `WP_GSTACK_MODE=fast` for one release, collect timing, then flip the default.

## Sources

1. [gstack setup script](https://raw.githubusercontent.com/garrytan/gstack/main/setup) — upstream source, high credibility, mixed sentiment.
2. [gstack repository](https://github.com/garrytan/gstack) — upstream project, high credibility, positive/informational.
3. [Command Line Interface Guidelines](https://clig.dev/) — guideline, high credibility, positive for output redesign.
4. [CLI Spec](https://clispec.dev/) — guideline/spec, medium-high credibility, positive for structured setup output.
5. [Bun install docs](https://bun.com/docs/pm/cli/install) — official docs, high credibility, positive for cache/logging controls.
6. [Bun global virtual store](https://bun.com/docs/pm/global-store) — official docs, high credibility, positive for install reuse.
7. [Git clone docs](https://git-scm.com/docs/git-clone.html) — official docs, high credibility, positive for quiet/progress/partial clone options.
8. [Git partial clone docs](https://git-scm.com/docs/partial-clone.html) — official docs, high credibility, positive for avoiding unnecessary transfer.
9. [Node child_process docs](https://nodejs.org/api/child_process.html) — official docs, high credibility, positive for implementing bounded subprocess output.
10. User-provided `wp setup` transcript — primary field evidence, high relevance, negative sentiment.
