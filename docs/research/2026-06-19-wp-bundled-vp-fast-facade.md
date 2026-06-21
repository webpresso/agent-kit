---
type: research
title: "Bundling Vite+ behind the wp facade"
subject: "How wp can include Vite+ package/task behavior while staying fast"
date: 2026-06-19
last_updated: 2026-06-19
confidence: high
verdict: adopt
---

# Bundling Vite+ behind the wp facade

> Adopt a facade-dependency model: `wp` stays the customer-facing command and resolves bundled Vite+ internally for package/task operations.

## TL;DR

- Vite+ already provides the semantics `wp` wants to hide: dependency install/update, binary execution, and workspace-aware `run` commands.
- The fastest low-risk design is to depend on `vite-plus` and resolve its package-local `bin/vp`, not reimplement or fully embed Vite+ inside the `wp` binary.
- Optional platform dependencies are the standard distribution tradeoff: fast native packages, but installs that omit optional deps must receive clear diagnostics.
- The exact `vite-plus` version must be smoke-tested because local `0.1.22` exposes a narrower command surface than the current docs.

## What This Is

`wp` already exposes `install`, `add`, `remove`, `update`, `exec`, and `run` commands as a managed facade. Today the runner still resolves `vp` as a PATH command. The proposed change makes the installed `@webpresso/agent-kit` package resolve bundled Vite+ first so customers do not need to install or know `vp`.

## State of the Art (2026)

Vite+ positions itself as a unified web toolchain and entry point for runtime, package-manager, frontend, and task operations ([Vite+ Getting Started](https://viteplus.dev/guide/)). Its install docs describe package-management commands such as install/add/remove/update ([Vite+ Installing Dependencies](https://viteplus.dev/guide/install)); its run docs describe workspace-aware `vp run` for package scripts and configured tasks ([Vite+ Run](https://viteplus.dev/guide/run)); and its binary docs cover `vp exec`/`vpx`/`vp dlx` for local and downloaded binaries ([Vite+ Running Binaries](https://viteplus.dev/guide/vpx)).

Native and platform-specific package distribution is already common in JS tooling. npm supports optional dependencies and package manifests that constrain OS/CPU installability ([npm package.json](https://docs.npmjs.com/files/package.json/)), and pnpm documents optional dependency omission plus OS/CPU/libc controls ([pnpm install](https://pnpm.io/cli/install), [pnpm add](https://pnpm.io/cli/add)). esbuild documents platform-specific install pitfalls and recommends installing with the package manager on the target platform ([esbuild Getting Started](https://esbuild.github.io/getting-started/)). Bun can compile standalone executables ([Bun single-file executable](https://bun.sh/docs/bundler/executables)), but that path is higher risk for Vite+ because Vite+ itself ships JS plus native/platform packages.

## Positive Signals

### Customer experience

- A bundled facade removes the current two-step mental model: install `vp`, then install/use `wp`.
- `wp` remains the product surface while Vite+ remains an implementation detail.

### Semantics and performance

- Reusing Vite+ preserves upstream package-manager and task-runner semantics instead of creating a drifting partial clone.
- `vp run` includes task caching and workspace dependency ordering, which aligns with the desire to keep commands fast ([Vite+ Run](https://viteplus.dev/guide/run), [Vite+ Task Caching](https://viteplus.dev/guide/cache)).
- Resolving a package-local bin once and caching the result is cheaper than full CLI bootstrapping for every package/task operation.

### Release fit

- The repo already has `vite-plus` as a dependency, so this is primarily a resolver/public-docs correction rather than a new toolchain bet.
- The existing `wp` runtime package model already handles platform-specific optional runtime packages, so the team has patterns for diagnostics and public readiness checks.

## Negative Signals

### Version drift

- Local fact-check found `vite-plus@0.1.22` installed in this repo, and `node node_modules/vite-plus/bin/vp --help` only listed `install` under package-manager commands. Current docs list a broader surface. Implementation must upgrade/pin and smoke-test the exact artifact.

### Optional dependency omissions

- Platform-native optional dependencies can be omitted by users or CI. pnpm explicitly supports `--no-optional`, and npm has analogous optional dependency controls. The `wp` diagnostic path must explain this failure mode instead of falling back silently.

### Single-binary temptation

- Bun `--compile` is attractive for a one-file artifact, but fully embedding Vite+ would increase compatibility risk around native packages, package-manager behavior, and subprocess execution. That should be a later experiment, not v1.

## Community Sentiment

Public writing around Vite+ emphasizes unified tooling and reduced coordination overhead ([VoidZero announcement](https://voidzero.dev/posts/announcing-vite-plus-alpha), [LogRocket Vite+ guide](https://blog.logrocket.com/vite-plus-guide-cli-javascript-tooling/)). The main caution is ecosystem maturity: Vite+ is young and its command surface is changing quickly, so exact-version testing matters more than doc-level assumptions.

## Project Alignment

### Vision Fit

Agent Kit’s public positioning is a single `wp` CLI/MCP surface for agent-driven development. Hiding `vp` behind `wp` directly supports that positioning and removes a known public no-`vp` setup gap recorded in prior research.

### Tech Stack Fit

The repo is TypeScript/Vitest/Zod and already uses `vite-plus` plus platform runtime optional dependencies. The lowest-risk integration point is `src/tool-runtime/resolve-runner.ts`, where all managed tool execution already centralizes.

### Trade-offs for Current Stage

The right v1 tradeoff is boring and shippable: bundled resolver + docs + smoke tests. A monolithic native artifact can be evaluated later only if the facade-dependency path proves too slow or too brittle.

## Recommendation

Adopt the facade-dependency approach with high confidence. First, verify or upgrade the `vite-plus` version, then route `getManagedRunner('vp')` and fallback `vp exec` through package-local Vite+. Add omitted-optional diagnostics and packed-install smoke tests before changing docs to promise no global `vp` requirement.

## Sources

1. [Vite+ Getting Started](https://viteplus.dev/guide/) — official docs, high credibility, positive.
2. [Vite+ Installing Dependencies](https://viteplus.dev/guide/install) — official docs, high credibility, positive.
3. [Vite+ Run](https://viteplus.dev/guide/run) — official docs, high credibility, positive.
4. [Vite+ Running Binaries](https://viteplus.dev/guide/vpx) — official docs, high credibility, positive.
5. [Vite+ Task Caching](https://viteplus.dev/guide/cache) — official docs, high credibility, positive.
6. [VoidZero Vite+ Alpha announcement](https://voidzero.dev/posts/announcing-vite-plus-alpha) — vendor announcement, medium credibility, positive.
7. [npm package.json docs](https://docs.npmjs.com/files/package.json/) — official docs, high credibility, neutral.
8. [pnpm install docs](https://pnpm.io/cli/install) — official docs, high credibility, neutral.
9. [pnpm add docs](https://pnpm.io/cli/add) — official docs, high credibility, neutral.
10. [esbuild Getting Started](https://esbuild.github.io/getting-started/) — official docs, high credibility, cautionary.
11. [Bun single-file executable docs](https://bun.sh/docs/bundler/executables) — official docs, high credibility, neutral.
12. [LogRocket Vite+ guide](https://blog.logrocket.com/vite-plus-guide-cli-javascript-tooling/) — engineering blog, medium credibility, positive.
