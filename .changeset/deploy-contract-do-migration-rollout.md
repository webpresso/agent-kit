---
"@webpresso/agent-kit": minor
---

`cloudflare-deploy-contract` audit now validates the production release metadata file: it must be valid JSON, and a release that declares `durableObjectMigration: "required"` must use `rolloutMode: "direct"`. Invalid JSON or a non-direct rollout for a Durable Object migration is reported as a loud audit violation rather than passing silently.
