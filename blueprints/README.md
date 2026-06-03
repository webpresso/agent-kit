# Blueprints

This directory is the canonical home for implementation plans (blueprints).
Each subdirectory represents a lifecycle state:

- `draft/` — early-stage sketches. Expect churn; move to `planned/` once scoped.
- `planned/` — committed-to specs, ready to pick up.
- `in-progress/` — actively being executed. Exactly one blueprint per lane.
- `completed/` — execution finished and verified. Kept for reference.
- `parked/` — intentionally paused. Include a reason in the spec's frontmatter.
- `archived/` — superseded or abandoned. Not deleted — the record matters.

## Authoring

- Use `docs/templates/blueprint.md` as the starting point.
- Blueprint YAML keys validated against `docs/templates/blueprint.yaml`.
- For iterative refinement, load the `plan-refine` skill
  (`.agent/skills/plan-refine/SKILL.md`).

## Moving between states

- `draft → planned`: the spec passes the plan-audit checklist
  (`.agent/guides/plan-audit-checklist.md`).
- `planned → in-progress`: work has started in a worktree or a lane.
- `in-progress → completed`: all acceptance criteria verified.
- Any state → `archived`: when the work is dropped or replaced.

Move files with `git mv` so history follows the spec through its lifecycle.


## Active work (2026-06-03)

| Blueprint | Path | Purpose |
| --------- | ---- | ------- |
| `wp` deploy orchestrator + toolchain isolation | [`in-progress/2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation.md`](./in-progress/2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation.md) | Managed runners, `deploy.adapterModule`, `wp deploy`, and `toolchain-isolation` are present in repo; remaining work is closeout proof plus the React preset types follow-up. |
| No first-party `.mjs` audit rollout | [`in-progress/no-first-party-mjs-audit-rollout/_overview.md`](./in-progress/no-first-party-mjs-audit-rollout/_overview.md) | Shared audit surface is being wired through CLI/MCP with the final public-contract proof still pending. |

## Planned next-up (2026-06-03)

| Blueprint | Path | Purpose |
| --------- | ---- | ------- |
| Global distribution MCP runtime fix | [`planned/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`](./planned/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md) | Fix the plugin MCP `-32000` reconnect/runtime issue via a single global native `wp` binary. |
| Claude plugin native runtime hardening | [`planned/2026-06-01-claude-plugin-native-runtime-hardening.md`](./planned/2026-06-01-claude-plugin-native-runtime-hardening.md) | Optional launcher-determinism / hooks-doctor hardening after the runtime-fix lane. |
| MCP managed Vitest launcher finalization | [`planned/2026-06-01-mcp-managed-vitest-launcher-finalization.md`](./planned/2026-06-01-mcp-managed-vitest-launcher-finalization.md) | Final review/proof lane for the managed Vitest launcher seam. |
