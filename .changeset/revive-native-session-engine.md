---
"@webpresso/agent-kit": minor
---

Revive the native Rust session-memory engine behind prebuilt NAPI optional packages and route MCP command capture through the native backend when available.

The native backend is optional: consumers without a compatible addon keep the TypeScript fallback, and fallback/native state is visible in MCP metadata. The published root package does not require Rust sources or first-use Cargo builds; source builds are development-only behind `WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1`.

Windows native optional packages are prepared for the storage/search addon surface only; MCP shell execution remains POSIX-host-only until Windows command semantics are explicitly supported.

Validation surfaces: docs/guides/session-memory.md, docs/bench/reference-parity-matrix.md, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, docs/bench/session-memory-methodology.md.
