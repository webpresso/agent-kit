---
type: vision
last_updated: 2026-05-27
---

# agent-kit Vision

AI-agent setup should feel like plugging in a charger: one motion, immediate
confidence, no manual wiring.

## North star

> **One command gives every coding agent the same repo brain.**

A developer runs:

```bash
wp setup
```

Then Claude Code, Codex, Cursor, Windsurf, Gemini, OpenCode, and compatible
agents all inherit the same instructions, skills, hooks, planning files, and
quality gates.

## Problem

AI-agent repos too often feel hand-wired. Every surface gets its own slightly
different instructions, hooks, skills, and planning habits. The result is drift,
extra setup, and a product that only works for the person who already knows the
maze.

## Product promise

webpresso is a plug-and-play convenience library for AI coding work. It should
hide setup mechanics behind safe defaults, keep advanced integrations optional,
and make the right thing the easiest thing.

## What we optimize for

- **Zero learning curve:** the happy path is install, setup, done.
- **Calm defaults:** no option soup in the public pitch.
- **One source of truth:** edit canonical agent content once; project surfaces
  follow.
- **Safe re-runs:** setup is idempotent and preserves consumer-owned work.
- **Proof over vibes:** tests, lint, typecheck, audits, and blueprint evidence
  are easy for agents to run and cite.
- **Evidence-gated evolution:** the harness itself improves from recorded
  failure evidence — mined patterns and measured non-regression — never from
  vibes. Proof over vibes applies to the kit, not just its consumers.

## Principles

- **Default first:** the main story must work without a tour of flags or internals.
- **One source of truth:** canonical agent content is edited once, then projected outward.
- **Calm surface area:** advanced choices belong on a small add-ons shelf, not in the happy path.
- **Re-runnable by design:** setup should be safe to run again without fear.
- **Operational honesty:** quality gates and references should prove what is true now.

## Boundaries

**In scope**

- `wp setup` as the primary product experience.
- Catalog-backed instructions, skills, hooks, docs templates, and blueprint
  scaffolding.
- Quality commands for tests, lint, typecheck, E2E, and audits.
- Weakness mining over agent-kit's own hook/QA evidence, and a
  regression-gated path for harness changes — advisory first, gated
  automation as the loop matures.
- A small add-on shelf for teams that need more than the default setup.

**Out of scope**

- Owning peer tools such as gstack, OMX/OMC, or RTK.
- Replacing application test/build systems.
- Model selection, prompt marketplaces, or AI-agent hosting.

## Direction: self-improving harness

What agent-kit installs around a coding agent is a **harness** — the industry
now has a name and a playbook for improving one (see
`docs/research/2026-06-10-harness-engineering-landscape.md`). The destination
is a gated loop: mine failure evidence → propose minimal changes → validate
against held-out consumer suites → promote with lineage. Guard hooks,
permission policies, and secret handling are locked surfaces, permanently
excluded from automated edits. The loop earns autonomy in stages; it never
skips the gate.

## Design test

If a new user has to understand add-ons, wiring, generated files, or blueprint
internals before `wp setup` is useful, the product surface is wrong.
