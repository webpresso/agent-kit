---
type: rule
slug: workflow-skills-routing
title: Webpresso workflow and browser skills
applies_to:
  - agents
  - humans
created: "2026-05-11"
last_reviewed: "2026-06-23"
---

# Webpresso workflow and browser skills

Webpresso ships curated workflow, review, browser, QA, design, and DX skills as native agent-kit package assets.

Default workflow skills include:

- `claude`
- `review`
- `autoplan`
- `investigate`
- `health`
- `plan-eng-review`
- `plan-ceo-review`
- `plan-design-review`
- `plan-devex-review`

Default browser/DX/QA skills include:

- `browse`
- `qa-only`
- `qa`
- `devex-review`
- `design-review`

Use these skills when their descriptions match the user's intent. They are unprefixed and should be presented as native Webpresso workflows.

## Ownership and provenance

- Source lives in the private workspace package `packages/workflow-skills`.
- Public assets are staged through `packages/workflow-skills/staging/allowlist.json`.
- Required MIT provenance is centralized in the package notice/provenance files and `THIRD-PARTY-NOTICES.md`.
- Refresh is manual blueprint work. Do not auto-sync from upstream or overwrite curated wording without preserving workflow intent and required attribution.

## Runtime boundary

Do not bundle dependency directories, generated host surfaces, native artifacts, or prebuilt browser payloads. Browser skills use Webpresso's Playwright-based runtime surface (`wp browser doctor`, `wp browser ensure`, `wp browser open`) and project-local preview/dev-server URLs when available.

## Mutation boundary

- `qa-only`, `browse`, `devex-review`, and `design-review` are report-first/read-only by default.
- `qa` may edit files only when the user explicitly requested fixes or grants a clear mutation gate after the report.

## Related surfaces

Use `wp_*` tools for tests, lint, typecheck, audits, blueprint execution, and quality gates. Use the curated review skills for plan critique, outside voice, and pre-landing review when explicitly requested or clearly useful.
