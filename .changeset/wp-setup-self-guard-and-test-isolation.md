---
"@webpresso/agent-kit": patch
---

Stop `wp setup` from scaffolding agent-kit's own repo, and harden hook launchers + test isolation.

- **Self-repo guard:** `wp setup` now refuses to scaffold `@webpresso/agent-kit`'s own working tree (the source of every agent-surface template) and writes nothing, instead of silently overwriting tracked `catalog/`/`.agent/`/`.claude` sources. Pass `--allow-self-scaffold` to override deliberately.
- **Test isolation:** `scaffold-agents-md` and `subagents` tests now resolve the catalog template via the package-anchored `resolveCatalogDir()` (import.meta-based) instead of `process.cwd()`, so they no longer read the live repo. A new `wp audit test-isolation` guardrail flags any `*.test.ts` that reaches the `catalog/` template source through `process.cwd()`.
- **Hook launcher hardening:** managed hook launchers prefer the self-contained compiled `wp` binary (`wp hook <sub>`) when the platform runtime package is installed — surviving node-path staleness from nvm/version changes — while keeping the absolute-node fallback unchanged.
