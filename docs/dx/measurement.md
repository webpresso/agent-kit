---
type: guide
title: Secret orchestration DX measurement
status: draft
created: 2026-06-19
last_updated: 2026-06-19
---

# Secret orchestration DX measurement

This guide defines the lightweight proof surface for the secret-orchestration
DX tasks.

Current automated proof points:

- `test/dx/tthw-harness.test.ts`
  - validates a helpful `wp secrets doctor --json` path
  - validates a dry-run `wp preview` plan path
- `test/dx/agent-readability.test.ts`
  - validates structured JSON error payloads for agents

These checks are intentionally fake-provider and fixture-driven. Live provider
smoke remains a separate credential-gated activity and is not treated as a PR
prerequisite.
