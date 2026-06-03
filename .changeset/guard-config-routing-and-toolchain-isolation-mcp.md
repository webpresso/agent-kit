---
"@webpresso/agent-kit": minor
---

feat(guard): config-driven pretool routing + expose `toolchain-isolation` over MCP

- `wp_audit` now accepts `kind: "toolchain-isolation"` (previously CLI-only),
  so agents/consumers can run it through the MCP surface.
- The pretool guard redirects `wp audit <kind>` (CLI) to
  `mcp__webpresso__wp_audit(kind=…)` for any known audit kind.
- New per-repo `.webpressorc.json` `guard` config (mechanism in agent-kit, data
  in the repo):
  - `guard.scriptRoutes`: maps a package script (e.g. `docs:check`) to a
    `wp_audit` kind; unknown kinds are ignored with a warning.
  - `guard.packageManager: 'vp-only'`: opt-in routing of raw `pnpm`/`npm`
    invocations to the `vp` facade.
- Audit kinds are now a single shared source (`src/mcp/tools/_shared/audit-kinds.ts`)
  consumed by both the `wp_audit` tool and the guard.

This lets consumers (e.g. edge-matte) delete bespoke repo-local pretool hooks
and rely on the shared guard surface.
