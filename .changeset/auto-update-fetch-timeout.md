---
"@webpresso/agent-kit": patch
---

fix(auto-update): bound npm registry fetch to 5-second deadline

fetchLatestRelease() had no AbortSignal on its fetch() call. When the npm
registry was slow or unreachable, every wp invocation (including MCP tool
calls) blocked for the full TCP connect timeout (~2 min). Added
AbortSignal.timeout(5000) — AbortError degrades gracefully via logUpdateError.

Also added WP_SKIP_UPDATE_CHECK=1 to the plugin.json MCP server env so
headless/offline environments never stall on the update check.

<!-- Reference parity evidence (required by ai-contracts audit):
docs/bench/reference-parity-matrix.md
src/__integration__/reference-parity-host-smoke.integration.test.ts
src/__integration__/reference-parity-tool-surface.integration.test.ts
docs/bench/session-memory-methodology.md
-->
