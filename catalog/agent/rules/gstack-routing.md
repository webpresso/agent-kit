---
type: rule
slug: gstack-routing
title: Webpresso-owned curated workflow skills
applies_to:
  - agents
  - humans
created: '2026-05-11'
last_reviewed: '2026-06-20'
---

# Webpresso-owned curated workflow skills

Webpresso now ships a small, curated set of workflow skills derived from useful
MIT-licensed gstack ideas. These skills are Webpresso-owned package assets, not
a live upstream checkout:

- `claude`
- `plan-eng-review`
- `plan-ceo-review`
- `plan-design-review`
- `review`

Use these skills when their descriptions match the user's intent. They are
unprefixed and should be presented as native agent-kit workflows.

## Ownership and provenance

- Source lives in the private workspace package `packages/gstack` (the private gstack workspace package).
- Public assets are staged through the allowlist in
  `packages/gstack/staging/allowlist.json`.
- MIT attribution is required through `packages/gstack/NOTICE.gstack.md`,
  `packages/gstack/provenance/upstream-gstack.json`, and
  `THIRD-PARTY-NOTICES.md`.
- Upstream refresh is manual blueprint work. Do not auto-sync from upstream or
  overwrite curated wording without preserving nuance and attribution.

## Runtime boundary

Do not bundle or require upstream payloads such as dependency directories,
generated host surfaces, native artifacts, or heavyweight runtime workflows.
`wp setup --with gstack` installs/stages the Webpresso-owned skills only.
External checkout cleanup is opt-in and must back up the user's directory.

## Related surfaces

Use `wp_*` tools for tests, lint, typecheck, audits, blueprint execution, and
quality gates. Use the curated review skills for plan critique, outside voice,
and pre-landing review when explicitly requested or clearly useful.
