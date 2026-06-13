---
title: Reference parity matrix
type: guide
last_updated: 2026-06-13
---

# Reference parity matrix

This matrix is the repo-owned checklist for replacement parity claims. A row
being present does not mean the release claim is green: required rows must be
`full` and `passed` before public replacement parity wording can be promoted.

## Row schema

- `capability`: replacement capability being claimed.
- `host scope`: hosts or surfaces covered by the row.
- `support level`: `full`, `degraded`, or `unsupported`.
- `proof artifact`: repo-local test, audit, benchmark, or doc that proves the row.
- `required for release`: `yes` when release-facing replacement parity claims must wait for this row.
- `status`: `passed`, `open`, or `blocked`.

| capability | host scope | support level | proof artifact | required for release | status |
| --- | --- | --- | --- | --- | --- |
| lifecycle capture | session memory store | full | src/session-memory/session.test.ts | yes | passed |
| resume injection | Claude, Codex, Cursor, OpenCode | degraded | src/hooks/sessionstart/index.test.ts | yes | open |
| tool discovery | MCP session tools | degraded | src/__integration__/reference-parity-tool-surface.integration.test.ts | yes | open |
| indexed search | session memory store | full | src/session-memory/store.test.ts | yes | passed |
| host setup smoke | Claude, Codex, Cursor, OpenCode | degraded | src/__integration__/reference-parity-host-smoke.integration.test.ts | yes | passed |
| benchmark thresholds | continuity and search benchmarks | degraded | docs/bench/session-memory-methodology.md | yes | open |
| release claim gating | public docs and release audits | degraded | src/audit/reference-parity-claims.test.ts | yes | open |
