---
"@webpresso/agent-kit": patch
---

Fix: add `open-source-licenses` to `wp_audit` MCP tool kind enum

`open-source-licenses` existed in the CLI `REPO_AUDIT_REGISTRY` and ran
correctly via `wp audit guardrails`, but was omitted from the MCP tool's
`AUDIT_KINDS` enum in `_shared/audit-kinds.ts`. Calling
`wp_audit({kind: "open-source-licenses"})` returned
`"Invalid wp_audit input for open-source-licenses"` instead of running
the audit.

Adds the kind to the enum, wires the dispatch case in `audit.ts`, updates
the tool description string, and adds a regression test.

Note: `guardrails` is a CLI-only umbrella that runs all repo audit kinds as
an aggregate — it is intentionally not an MCP kind.
