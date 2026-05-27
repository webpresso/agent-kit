---
description: Run a webpresso audit (tph | catalog-drift | package-surface | docs-frontmatter | blueprint-lifecycle | bundle-budget | commit-message | tech-debt | architecture-drift)
---
Use the `mcp__webpresso__wp_audit` tool to run an audit. Pass `kind` as one of `tph`, `catalog-drift`, `package-surface`, `docs-frontmatter`, `blueprint-lifecycle`, `bundle-budget`, `commit-message`, `tech-debt`, or `architecture-drift` based on what the user asks for.

`architecture-drift` verifies a repo-local `docs/architecture.contract.json`
contract against:

- required architecture docs
- required architecture text/rules
- active blueprint links to architecture docs/contracts
- required `Architecture before` / `Architecture after` sections for
  architecture-changing blueprints
