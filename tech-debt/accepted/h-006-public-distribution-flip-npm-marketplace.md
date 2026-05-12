---
type: tech-debt
status: accepted
severity: medium
category: distribution
review_cadence: monthly
last_reviewed: '2026-05-11'
created: '2026-05-11'
linked_blueprints: ['agent-kit-v1-evidence-ledger']
affected_modules: ['package.json', '.claude-plugin']
---

# public distribution flip (npm + Anthropic marketplace + landing)

## Context

The CEO plan dated 2026-05-11 deferred public distribution to a
soft-launch sequence: ship v1.0 alpha to the current restricted
GitHub Packages registry first, let `ozby/ingest-lens` (the reference
consumer) consume v1.0 for one full release cycle in production,
then flip to public.

Today `package.json#publishConfig.access` is `"restricted"`. There is
no entry in `anthropics/claude-plugins-official`. There is no public
landing page.

This means: no external user can `pnpm add @webpresso/agent-kit`.
The wedge can't compound until distribution opens.

## Why this is debt, not a feature

v1.0's evidence-ledger wedge ("verified execution record for AI coding
work") has zero leverage without an audience. The current restricted
distribution is appropriate for soft-launch but blocks adoption beyond
the webpresso pattern's reference consumer.

The deferral was explicit per `/plan-ceo-review` decision X2 (v1.0
timing unresolved). The trigger is external validation, not calendar
time.

## Watch points (review every cadence)

- **ingest-lens production logs** for `@webpresso/agent-kit@v1.x` —
  any P1 bug, rollback, or breaking-change incident extends the
  soft-launch period.
- **Anthropic marketplace submission process** — what's the current
  curation lead time at `anthropics/claude-plugins-official`?
  Read https://github.com/anthropics/claude-plugins-official
  occasionally to track.
- **Public-API surface stability** in `./runners/*` exports — any
  breaking change before this flip resets the "external adopter
  validation" clock.

## Trigger

Resolve this item when **all of the following** are true:

- `ozby/ingest-lens` has consumed `@webpresso/agent-kit@v1.x` in
  production for at least four weeks with no rollback events.
- No P1 bugs filed against agent-kit in the same window.
- v1.0 SemVer-stable declaration condition met (CEO plan unresolved
  X2 — one external repo runs two Runner backends + one failure-
  recovery path).
- README + landing page draft reviewed via
  `/plan-design-review`.

## Action when triggered

1. Flip `package.json#publishConfig.access` from `"restricted"` to
   default-public.
2. Update `.npmrc` if it scopes `@webpresso` to GitHub Packages —
   ensure public npm-registry resolution works.
3. Verify `pnpm lint:pkg` (publint + attw) still passes on the
   public-resolved package.
4. Submit `.claude-plugin/marketplace.json` to
   `anthropics/claude-plugins-official` PR queue.
5. Stand up the landing page (suggested: `agent-kit.dev` or
   `webpresso.dev/agent-kit`) with the X1 wedge framing
   ("verified execution record for AI coding work") + install
   one-liner.
6. Update README install path: `pnpm add -D @webpresso/agent-kit
   && pnpm exec ak setup`.
7. Announce on webpresso channels + relevant developer communities.
8. Move this file to `tech-debt/resolved/` with the release-cycle
   commit link.

## Related

- CEO plan deferred decision C4 (public distribution).
- CEO plan unresolved X2 (v1.0 SemVer-stable timing).
- Blueprint acceptance criteria for v1.0 alpha
  (`blueprints/planned/agent-kit-v1-evidence-ledger/_overview.md`).
- Sibling tech-debt: `h-003-opencode-runner-execution-backend.md`
  — broad adoption benefits from opencode users having a real
  Runner.
