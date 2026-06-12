---
"@webpresso/agent-kit": minor
---

Wire secrets-policy, no-dev-vars, secret-provider-quarantine, and secrets-config audit kinds to the `wp audit` CLI

These four governance audit modules existed in `src/audit/` and were callable via the `wp_audit` MCP tool but missing from the CLI `REPO_AUDIT_REGISTRY`. Running `wp audit secrets-policy` (or any of the other three) returned "unknown kind" instead of executing the audit.

Consumer repos can now retire bun-script fallbacks in `verify:secrets` and pre-commit hooks and use `wp audit secrets-policy`, `wp audit no-dev-vars`, `wp audit secret-provider-quarantine`, and `wp audit secrets-config` directly.
