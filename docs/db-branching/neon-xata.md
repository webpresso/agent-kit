---
type: guide
title: Neon and Xata DB branching
status: draft
created: 2026-06-19
last_updated: 2026-06-19
---

# Neon and Xata DB branching

This guide records the v1 DB-branching contract for secret orchestration.

- **Current target:** Neon
- **Future-gated target:** Xata
- **Non-DB apps:** skip DB branching entirely with explicit evidence

The contract is provider-neutral at the type level:
- branch creation metadata
- connection-string handoff
- smoke-check command
- TTL / lease lifetime
- cleanup command

In v1, the contract documents Xata as a future target without requiring any
Xata implementation in the current slice.
