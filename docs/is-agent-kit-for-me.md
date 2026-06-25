---
type: guide
title: Is webpresso for me?
description: A one-screen answer to whether webpresso fits your repo.
last_updated: "2026-05-29"
---

# Is webpresso for me?

Yes, if your AI-agent repo is spending its context window on verbose tool
output and duplicated guidance — and you want that fixed without hand-rolling
per-agent plumbing.

## Use it when

- Agents burn context on thousand-line test/lint/build logs you want returned
  as compact, citable summaries.
- You want output-filtering lanes and bundle budgets wired in by default.
- You want planning files and quality gates available to agents by default.
- You want `VISION.md`, architecture docs, and implementation checked for drift
  in CI instead of trusted to stay in sync.
- You want your `AGENTS.md`, `CLAUDE.md`, and per-agent surfaces generated and
  kept in sync instead of copied by hand.
- You want setup to be re-runnable instead of tribal knowledge.

## Skip it when

- You only want a prompt library.
- You only need to emit shared instruction files — `AGENTS.md` plus an emitter
  like rulesync already covers that, and `wp` is the layer above it.
- You do not want repo-local agent files.
- Your repo cannot run Node-based developer tooling.

## The test

Run:

```bash
wp setup
```

If the generated repo contract, hooks, blueprints, and templates are useful,
webpresso fits. If not, remove the generated files and keep your current setup.

## Mental model

webpresso is not another agent, and it is not just an instruction-file emitter.
It is the TypeScript runtime that keeps every agent in context — compact quality
evidence, filtered output, budgeted bundles — and keeps the shared `AGENTS.md` /
`CLAUDE.md` contract coherent on top.
