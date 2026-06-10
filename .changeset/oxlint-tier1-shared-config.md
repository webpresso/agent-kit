---
"@webpresso/agent-kit": minor
---

Ship a resolved shared oxlint config so consumers need no `oxlint.config.ts` and no `oxlint` dependency. agent-kit now generates one `oxlintrc.json` at build (next to the compiled plugins) and `wp lint` injects it via `--config` unless the consumer ships a local oxlint config or passes `--config` — the linter version, plugins, rules, and standard ignores are gated to `@webpresso/agent-kit`. `wp setup` no longer scaffolds `oxlint.config.ts` (a consumer may still commit one to override). Also closes a `no-hardcoded-repo-root` matcher gap so `join(x, '..', '..')` (two separate `'..'` args) is flagged in production code.
