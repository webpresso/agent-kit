---
"@webpresso/agent-kit": minor
---

Add `ak audit no-link-protocol` repo guardrail. Fails when any
`package.json` (root or workspace member) declares a `link:<filesystem-path>`
value in `dependencies`, `devDependencies`, `optionalDependencies`, or
`pnpm.overrides`. `link:` filesystem-couples consumer clones to a
maintainer's directory layout and hides version-pin drift — use `catalog:`
(cross-repo) or `workspace:*` (intra-repo) instead.

Automatically picked up by `ak audit guardrails` (pre-commit composite) and
`ak audit quality` (full ship gate).
