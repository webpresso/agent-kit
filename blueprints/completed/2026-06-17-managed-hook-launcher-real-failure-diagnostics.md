---
type: blueprint
title: Managed hook launchers preserve real failure diagnostics
status: completed
complexity: M
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - hooks
  - codex
  - claude
  - diagnostics
  - scaffolder
completed_at: '2026-06-17'
---

# Managed hook launchers preserve real failure diagnostics

## Summary

Fix the source-of-truth hook scaffolder so generated managed launchers no longer
rewrite legitimate `wp-pretool-guard` failures into fake PATH-missing errors.
Make launchers execute the packaged `wp-*.js` hook bins directly, and keep the
dedup / ownership parser stack compatible with both the legacy guarded shell
form and the new `if/then/else` wrapper.

## Acceptance

- [x] Guarded hook wrappers only use fallback JSON when the launcher is missing.
- [x] Legitimate pretool guard failures preserve their real stderr/exit path.
- [x] Generated managed launchers execute packaged hook bins directly rather
      than depending on `wp hook ...` globally.
- [x] Parser / dedup / ownership logic recognizes both old and new guarded
      shell forms.

## Verification

- `wp lint`
- `wp typecheck`
- `wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/merge.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/codex-ownership.test.ts`
