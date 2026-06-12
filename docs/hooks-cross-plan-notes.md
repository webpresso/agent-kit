---
type: guide
last_updated: '2026-06-07'
---

# Hooks System — Cross-Plan Notes

## Canonical CLI name (X11 decision)

These docs use `wp` as the canonical CLI name. The monorepo has a pending
`unified-cli-public-cutover` plan that may change the public CLI name.

**Action required before publishing hooks docs:**
- Coordinate with the monorepo `unified-cli-public-cutover` plan
- Confirm `wp` is the canonical public name (not `webpresso`, not `ak`)
- Update all hooks docs and quickstart examples after the cutover lands

The `wp hooks *` command surface was designed with the canonical name decision
pending. All user-facing docs in this series use `wp` per the X11 decision in
the hooks-orchestrator blueprint review.

## Cursor third-party compatibility

Cursor's ability to load `.claude/settings.json` hooks is **opt-in** (Cursor
Settings → Features → Enable Third-party skills). When this toggle is on:
- Both `.cursor/hooks.json` AND `.claude/settings.json` hooks fire
- This causes double-fire for any hook registered in both surfaces
- wp setup's emission-time guard prevents double-registration

This behavior is documented in `catalog/agent/rules/supported-agent-clis.md`.

## OMC / RTK coordination contract

This repo does **not** invent hook ordering between multiple systems.
The bounded contract is:

- webpresso owns `wp_*` routing and managed hook launchers
- RTK owns shell filtering where it is explicitly installed
- `wp audit hook-surface` enforces the single-rewriter-per-matcher invariant

Practical consequence:

- shared events are expected
- overlapping validators are allowed
- overlapping **rewriters** on the same matcher are drift and must fail audit

For Bash-routing collisions, prefer the existing audit + ownership-lane model
over bespoke chaining logic in webpresso. Supporting fact-check:

- `docs/research/2026-05-13-hook-coordination-fact-check.md`
