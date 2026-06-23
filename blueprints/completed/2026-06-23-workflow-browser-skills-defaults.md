---
type: blueprint
title: Workflow and browser skills as Webpresso defaults
status: completed
complexity: L
owner: agent
created: '2026-06-23'
last_updated: '2026-06-23'
completed_at: '2026-06-23'
tags:
  - setup
  - skills
  - browser
---

# Workflow and browser skills as Webpresso defaults

## Outcome

Absorb the curated workflow skills into Webpresso's default skill projection,
add a Playwright-backed browser runtime/doctor, and retire the old active
external workflow checkout identity from setup, hooks, and update paths.

## Acceptance criteria

- [x] Fresh `wp setup` default skill projection includes workflow skills:
      `claude`, `review`, `autoplan`, `investigate`, `health`, and plan-review
      skills.
- [x] Fresh `wp setup` default skill projection includes browser/DX/QA skills:
      `browse`, `qa-only`, `qa`, `devex-review`, and `design-review`.
- [x] Browser runtime uses Playwright with `wp browser doctor`,
      `wp browser install`, and a lightweight `wp browser open` smoke helper.
- [x] Setup presets, hook scaffolders, update/ownership code, and active docs no
      longer reference or install a retired external workflow checkout.
- [x] Public notices keep only minimal MIT provenance for adapted skill assets.
- [x] Active source/templates pass the retired-identity string audit.

## Verification

- `vp run typecheck`
- `./bin/wp audit legacy-workflow-identity`
- Focused workflow/browser/setup/update/hook tests documented in the final task
  report.
