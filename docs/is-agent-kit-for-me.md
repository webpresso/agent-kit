---
type: guide
title: Is Agent Kit for me?
description: A one-screen answer to whether Agent Kit fits your repo.
last_updated: "2026-06-25"
---

# Is Agent Kit for me?

Use Agent Kit when coding agents need a real repo harness, not just better
prompts.

## Good fit

Agent Kit fits when you want:

- one setup command for agent instructions, hooks, MCP config, skills, docs
  templates, and safe ignores;
- compact, citable quality output instead of thousand-line test/lint/build logs;
- a stable `wp` facade for tests, lint, typecheck, format, E2E, QA, audits,
  worktrees, secrets, and package tasks;
- local session memory with explicit search, restore, capture, retrieve, reset,
  and doctor commands;
- docs, blueprints, catalog projections, paths, secrets, and package surfaces
  checked for drift in CI;
- generated Claude/Codex/host surfaces kept in sync from canonical sources.

## Poor fit

Skip it when:

- you only want a prompt or skill library;
- you cannot run Node-based developer tooling;
- you do not want repo-local agent files;
- you need a hosted agent service rather than local repo automation;
- you need OSI-open-source licensing for every dependency or tool in the stack.

## Quick test

Run:

```bash
wp setup repair --project-init
wp hooks doctor
```

If the generated repo contract, hooks, MCP tools, blueprints, and templates are
useful, Agent Kit fits. If not, remove the generated files and keep your current
setup.

## Mental model

Agent Kit is not another agent. It is the TypeScript runtime that keeps agents
inside a verifiable repo contract: compact evidence, filtered output, bounded
MCP tools, synced host surfaces, and safety gates that humans can inspect.
