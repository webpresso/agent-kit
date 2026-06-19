---
"@webpresso/agent-kit": minor
---

Add scientific session-memory benchmark infrastructure and public-claim hardening (Option B).

Introduces: canonical `report.json` measurement artifact with per-run unique runId and
content-addressed manifestDigest; metric-class taxonomy (byte_proxy, provider_tokens_cost,
recall, hook_latency, native_speedup, replacement_parity, rtk_context_mode) with claim
binding enforcement; redaction/privacy scanner for shipped artifacts; capability registry
SSOT; phased bounded consumer-smoke readiness; and the full gate wiring in
`public:readiness`. No numeric benchmark claim ships without a first-party result card of
the matching metric class.
