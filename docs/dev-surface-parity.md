---
type: research
last_updated: '2026-04-25'
---

# `ak dev` parity report

Status: Phase 4 complete. External consumer adoption is explicitly parked.

## Webpresso parity evidence

Date: 2026-04-24

### `just dev platform-api`

- Command reached the new `ak dev` preflight path through the checked-in
  `webpresso/app-manifest.yaml`.
- `ak dev platform-api --manifest webpresso/app-manifest.yaml --doctor`
  resolved `["api"]`.
- The existing host execution path still handled the real startup:
  `"[Neon] Using existing branch: dev/ozby"` followed by
  `"📦 Starting platform-api..."`.
- The verification run was interrupted with `SIGINT` after startup evidence
  was captured so the session would not stay resident.

### `just dev-recover platform-api`

- Command ran the new `ak dev --restart` preflight before host recovery.
- Recovery sequence preserved the existing behavior:
  `doctor -> cleanup -> doctor -> dev`.
- First doctor run failed on an existing port conflict for `api:4001`.
- Cleanup removed the stale PM2 state.
- Second doctor run passed with `All dev ports are free`.
- The final handoff again reached the same runtime startup path:
  `"[Neon] Using existing branch: dev/ozby"` then
  `"📦 Starting platform-api..."`.
- The verification run was interrupted with `SIGINT` after startup evidence
  was captured, then `just dev-cleanup` was run to leave local state clean.

## External consumer status

No qualifying external multi-process consumer was available in-cycle.

- `node-pubsub` remains insufficient for this blueprint because it is not
  proven here as a multi-process dev surface with readiness probes and group
  aliases.
- Webpresso itself is parity host evidence, not external-adoption evidence.

Result: the real-consumer slice is parked, not silently skipped.

## Fixture fallback

Fixture path:

`packages/cli/agent-kit/fixtures/dev-two-process/app-manifest.yaml`

Validation command:

```bash
ak dev --manifest \
  packages/cli/agent-kit/fixtures/dev-two-process/app-manifest.yaml \
  full-stack
```

Expected resolution:

- `api`
- `web`

The fixture validates the public contract only. It adds no consumer-specific
behavior to `@webpresso/agent-kit`.
