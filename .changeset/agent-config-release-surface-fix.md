---
"@webpresso/agent-kit": patch
"@webpresso/agent-config": patch
---

Repair the extracted agent-config release surface by cataloging shared deps, removing the root package's non-publishable local manifest edge, and recording the new public package in the package-surface contract.

Evidence:
- docs/bench/reference-parity-matrix.md
- src/__integration__/reference-parity-host-smoke.integration.test.ts
- src/__integration__/reference-parity-tool-surface.integration.test.ts
- docs/bench/session-memory-methodology.md
