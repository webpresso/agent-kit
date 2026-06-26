---
type: vision
last_updated: 2026-06-25
---

# Agent Kit vision

AI-agent setup should feel like plugging in a charger: one motion, immediate
confidence, no manual wiring.

## North star

> One command gives every coding agent the same repo contract.

```bash
wp setup
```

After that, Claude, Codex, Cursor, OpenCode, and compatible hosts should see the
same instructions, skills, hooks, planning files, MCP tools, and quality gates.

## Problem

Agent-enabled repos drift. Each host gets its own rules, commands, hooks,
skills, memory habits, and setup notes. The result is a fragile maze that works
only for the person who built it.

## Product promise

Agent Kit is the harness around coding agents. It hides setup mechanics behind
safe defaults, keeps advanced integrations optional, and makes the right thing
easy to verify.

## Principles

- **Default first:** install, setup, doctor, done.
- **One source of truth:** edit canonical content once; projections follow.
- **Calm surface area:** advanced add-ons stay off the happy path.
- **Safe re-runs:** setup preserves consumer-owned work.
- **Evidence over assertions:** claims need tests, audits, docs gates, or result cards.
- **Delete stale docs:** obsolete guidance is worse than missing guidance.
- **Locked safety surfaces:** hooks, permissions, and secrets are never casual automation targets.
- **Honest licensing:** the repo is public and source-available under Elastic License 2.0.

## In scope

- `wp setup` as the primary product experience
- CLI and MCP lanes for test, lint, typecheck, format, E2E, QA, docs, audits,
  and release readiness
- Session memory, worktrees, blueprints, hooks, skills, and host plugin artifacts
- Secret-safe command execution and preview/deploy support
- Evidence-gated harness improvement from real failures

## Out of scope

- Replacing application build systems
- Owning model selection or agent hosting
- Prompt marketplaces
- Hosted access that conflicts with the project license
- Unchecked self-modifying safety policy

## Design test

If a new user must understand generated files, add-ons, or blueprint internals
before `wp setup` is useful, the product surface is wrong.
