---
type: blueprint
title: Changeset Markdown-safe release claim gate
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - ci
  - release
  - changesets
  - audit
completed_at: '2026-06-17'
---

# Changeset Markdown-safe release claim gate

## Summary

Prevent reference-parity evidence paths in pending Changesets notes from passing
on `main` and then failing only after Changesets renders them into
`CHANGELOG.md`. Paths containing Markdown emphasis-sensitive segments such as
`__integration__` must be protected as inline code before release generation.

## Acceptance

- [x] `auditAiContracts` fails pending changeset release notes that cite
      emphasis-sensitive evidence paths without inline-code protection.
- [x] `auditAiContracts` accepts the same pending release notes when evidence
      paths are wrapped in inline code.
- [x] The current pending changeset cites reference-parity evidence paths in
      Markdown-safe inline code.

## Verification

- `pnpm exec vitest run src/audit/ai-contracts.test.ts`
- `./bin/wp audit ai-contracts`
