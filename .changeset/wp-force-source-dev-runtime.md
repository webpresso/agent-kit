---
"@webpresso/agent-kit": patch
---

Fix: add `WP_FORCE_SOURCE=1` launcher flag so agent-kit dev commits no longer require `--no-verify`

The compiled `bin/runtime/<arch>/wp` binary went stale during iteration, causing `wp audit` to
fail against unbuilt source and forcing `--no-verify` workarounds. `WP_FORCE_SOURCE=1` short-
circuits the runtime-lane dispatch for non-latency-sensitive `wp` commands, routing them to
`src/cli/cli.ts` via the existing `buildSourceLaunchPlan` helper.

F1-scoped: the 7 latency-sensitive hook bins (`wp-pretool-guard`, `wp-post-tool`, etc.) keep
using the compiled binary regardless, so a global `export WP_FORCE_SOURCE=1` in `.envrc` does
not pay cold-bun startup on every Edit/Write in an agent session.

Ships with: `.envrc` (direnv, whole-clone coverage), `export WP_FORCE_SOURCE=1` in both husky
hooks (belt-and-suspenders), and a `pnpm wp` dev script for contributors without direnv.
Symmetric with the existing `WP_FORCE_COMPILED_RUNTIME` flag. Safe no-op for consumer installs
(guarded by `hasSource`).
