---
type: rule
slug: rtk-routing
title: RTK Tool Routing
status: active
scope: repo
applies_to: [agents]
related: []
created: "2026-05-07"
last_reviewed: "2026-05-07"
paths:
  - "**/*"
---

# RTK Tool Routing

`rtk *` and the `wp_*` MCP tools are independent lanes. Webpresso-owned dev
workflows route to the matching `wp_*` MCP tool — each tool's `description`
states when to use it, and `pretool-guard` denies the common raw equivalents.
There is no injected routing block; the tool descriptions plus AGENTS.md are the
source of routing guidance.

Use `rtk *` for shell-tool output filtering on the long-tail command surface
that webpresso does not own.

## Ownership boundary

- webpresso owns `wp_*` dev-workflow routing and MCP-shaped deny wording
- rtk owns shell-tool output filtering for the long-tail surface (`git`, `gh`,
  `kubectl`, `cargo`, `pytest`, `ruff`, and similar non-quality-engine tools)
- `wp_*` and `rtk *` are independent lanes; prefer the `wp_*` MCP tool for
  webpresso-owned workflows
- `.omx` is runtime/state, not a direct hook surface

## Hard rules

- Never reimplement upstream rtk filters in webpresso.
- Never wrap the `rtk` prefix behind `wp rtk`.
- Keep `wp_*` and `rtk *` as independent lanes.

## Lane 4: Webpresso workflow/browser skills

Webpresso owns workflow, browser, QA, design, and DX skills as native package assets.
Browser runtime checks and lightweight page inspection route through `wp browser`.
Keep these as an independent lane from the `wp_*` MCP tools.

## Subprocess coverage note

wp*\* tools shelling out via child_process.spawn own their own filtering; rtk PreToolUse hook
only fires for top-level Bash calls and does NOT reach into wp*\* internals. CLI verbs
(wp <verb> from a shell) ARE rewritten by rtk.
