---
"@webpresso/agent-kit": minor
---

Add `wp audit supported-agent-clis`: a drift gate that asserts the CLI
identifiers listed in `catalog/agent/rules/supported-agent-clis.md` match the
authoritative code lists (`AgentHostName` ∪ `CapabilityMatrixHost`) in both
directions. This makes real the gate both CLAUDE.md files already reference.
Also exposed via the `wp_audit` MCP tool and the `wp audit guardrails` composite.
