---
"@webpresso/agent-kit": minor
---

Add a public `@webpresso/agent-kit/repo-root` subpath export (`findRepoRoot`,
`resolveFromRepoRoot`) so agent-kit-only consumers (which cannot import the
framework facade) resolve the workspace root from one shared implementation
instead of hand-rolling a `findRepoRoot` copy each. Backed by the existing
internal marker walk; a strict upward walk that fails closed and deliberately
does not fall back to `CLAUDE_PROJECT_DIR`. First surface of the DRY-convergence
program (see `blueprints/draft/dry-convergence-consumer-infra-roadmap.md`).
