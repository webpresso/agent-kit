# Changelog

All notable changes to `@webpresso/agent-kit` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

## [0.1.0] — 2026-04-25

### Added
- Blueprint runtime: `ak blueprint new/list/show/audit/exec/move/finalize/start/task`
- Agent-surface symlinker: `ak symlink sync/check/import`
- Skills catalog with 13 bundled skills
- `ak setup` scaffolder: Tier-1/2/3 skill tiers, presets (omx, gstack, lore-commits)
- Claude Code plugin (`.claude-plugin/`) with PreToolUse, PostToolUse, Stop, SessionStart hooks
- Coordinated PreToolUse hook: dev-command routing + sandbox routing + validators in one process
- SessionStart routing block (AK_ROUTING_BLOCK XML) injected at session start and after compaction
- `ak audit` suite: tph, bundle-budget, catalog-drift, docs-frontmatter, blueprint-lifecycle,
  no-relative-parent-imports, mutation, quality composite gate
- `ak hooks doctor` for post-install plugin health verification
- `ak tech-debt` lifecycle management (new, list, review)
- `ak symlink import --from <file>` for onboarding existing IDE rule files
- MCP server with 6 tools: ak_test, ak_lint, ak_typecheck, ak_qa, ak_audit, ak_blueprint
- `resolvePackageAsset()` utility replacing fixed-depth relative path traversals
- `auditNoRelativeParentImports` guardrail for 3+ level runtime path traversals
