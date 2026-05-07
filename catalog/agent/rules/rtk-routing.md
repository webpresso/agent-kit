---
type: rule
slug: rtk-routing
title: RTK Tool Routing
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
paths: 
  - '**/*'
---

# RTK Tool Routing

Fallback-only note: if SessionStart already injected `AK_ROUTING_BLOCK`, or
rtk already injected its own `rtk *` guidance, follow that and do not
duplicate it. This rule exists to preserve the same routing in plain repo
contexts where no injected routing block is present.

Use `rtk *` for shell-tool output filtering on the long-tail command surface
that agent-kit and context-mode do not own.

## Ownership boundary

- agent-kit owns `ak_*` dev-workflow routing and MCP-shaped deny wording
- context-mode owns `ctx_*` nudging when that plugin is installed
- rtk owns shell-tool output filtering for the long-tail surface (`git`, `gh`,
  `kubectl`, `cargo`, `pytest`, `ruff`, and similar non-quality-engine tools)
- this rule is fallback-only; it should not compete with SessionStart routing
- `.omx` is runtime/state, not a direct hook surface

## Hard rules

- Never reimplement upstream rtk filters in agent-kit.
- Never wrap the `rtk` prefix behind `ak rtk`.
- Keep `ak_*`, `ctx_*`, and `rtk *` as independent lanes.
