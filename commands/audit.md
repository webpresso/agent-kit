---
description: Run a webpresso audit
---
Use the `mcp__webpresso__wp_audit` tool when the requested audit is available
through MCP, or `./bin/wp audit <kind>` from this source repo for the full CLI
registry. Common `kind` values include `guardrails`, `quality`,
`catalog-drift`, `package-surface`, `docs-frontmatter`, `blueprint-lifecycle`,
`blueprint-readme-drift`, `cloudflare-deploy-contract`, `harness-surfaces`,
`weakness-mining`, `harness-overlay-evidence`, `bundle-budget`,
`commit-message`, `tech-debt`, and `architecture-drift`.

`architecture-drift` verifies a repo-local `docs/architecture.contract.json`
contract against:

- required architecture docs
- required architecture text/rules
- active blueprint links to architecture docs/contracts
- required `Architecture before` / `Architecture after` sections for
  architecture-changing blueprints

Harness-specific audits:

- `harness-surfaces` validates `catalog/agent/harness-surfaces.yaml` against
  the repo layout.
- `weakness-mining` clusters available hook evidence and can draft tech-debt
  when invoked with the matching CLI option.
- `harness-overlay-evidence` validates `agent-overlays/<cli>/manifest.yaml`
  evidence and target-safety rules; an empty overlay set is valid.
