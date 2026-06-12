---
type: rule
slug: gstack-routing
title: gstack routing — lane 4 interactive/browser workflows
applies_to:
  - agents
  - humans
created: '2026-05-11'
last_reviewed: '2026-05-11'
---

# gstack routing — lane 4: interactive/browser workflows

Fallback-only note: if SessionStart already injected `WP_ROUTING_BLOCK`, or
any other routing block is already present, follow that and do not duplicate
it. This rule exists to preserve the same routing in plain repo contexts.

gstack owns interactive/browser workflows: slash-skill invocation
(`/qa`, `/ship`, `/review`, `/investigate`, `/browse`, `/plan-ceo-review`,
etc.), AskUserQuestion-gated decisions, browser automation, and design
tooling. It is **lane 4** in the webpresso ownership model:

| Lane | Owner | Surface |
| ---- | ----- | ------- |
| 1 | webpresso | `wp_*` dev-workflow (blueprint execution, audits, quality) |
| 2 | rtk | shell-tool output filtering for non-quality-engine commands |
| **3** | **gstack** | **interactive/browser workflows, skill UX, CEO/design reviews** |

## When to invoke gstack

Use gstack skills when the workflow is:

- **Interactive** — requires AskUserQuestion gates, multi-step human
  collaboration, or visual review.
- **Browser-backed** — uses the browse daemon, Playwright, or screenshot
  capture.
- **Role-based** — `/plan-ceo-review`, `/plan-eng-review`, `/plan-design
  -review`, `/qa`, `/ship`, `/investigate` — each skill plays a specific
  expert role.
- **Agent-to-browser** — `/browse`, `/design-review`, `/qa-only`, etc.

## When NOT to use gstack

Do not invoke gstack for:

- Running tests, lint, typecheck, or audits → use `wp_test`, `wp_lint`,
  `wp_typecheck`, `wp_qa`, `wp_audit`.
- Shell output filtering → use `rtk`.

## How gstack is installed

gstack is **not bundled or redistributed by webpresso**. It lives at
`~/.claude/skills/gstack/`, cloned from Garry Tan's repo at
https://github.com/garrytan/gstack. `wp setup` prints a recommend-install
line but never clones on the user's behalf.

This is intentional: gstack is Garry Tan's project. Redistributing it
would bypass the upstream update path and violate the lane-4 boundary.

To install: run `cd ~/.claude/skills && git clone https://github.com/garrytan/gstack`
and follow the setup instructions.

## Hard rules

- Never implement or replicate gstack skills inside webpresso.
- Never import gstack internals from `wp` CLI code.
- Never wire gstack into webpresso's hook chain as a first-class hook
  (gstack has its own lifecycle; hooks are installed by `./setup --team`).
- Keep lanes 1-2 (`wp_*`, `rtk *`) as independent routing
  surfaces; lane 3 is advisory, not the primary control surface for
  dev-workflow operations.

## Ownership boundary

- webpresso owns `wp_*` dev-workflow routing.
- rtk owns shell-tool output filtering for the long-tail command surface.
- **gstack owns lane 3.** webpresso defers to it there; it does not
  compete, replicate, or absorb it.
- `.omx` is runtime/state, not a direct hook surface.

## Subprocess coverage note

`wp_*` tools shelling out via `child_process.spawn` own their own
filtering; `rtk` PreToolUse hook only fires for top-level Bash calls and
does NOT reach into `wp_*` internals. CLI verbs (`wp <verb>` from a shell)
ARE rewritten by rtk. gstack skill invocations from within Claude Code
are NOT filtered by rtk (they go through the Claude Code plugin lifecycle).
