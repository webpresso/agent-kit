---
type: tech-debt
status: accepted
severity: medium
category: dependency
review_cadence: monthly
last_reviewed: '2026-05-11'
created: '2026-05-11'
linked_blueprints: ['agent-kit-v1-evidence-ledger']
affected_modules: ['src/runners/codex-exec']
---

# codex-exec workspace-write Runner support

## Context

v1.0 alpha ships the `codex-exec` Runner backend with `permissions: read`
mode only. Tasks declaring `permissions: workspace-write` in their
frontmatter are rejected at `Runner.prepare()` with a clear error pointing
at this tech-debt item.

The decision came out of `/plan-eng-review`'s outside-voice pass on
2026-05-11. Codex's public issue history (queried via `codex exec` against
the OpenAI Codex repo) showed concrete stability issues for `-s
workspace-write` mode:

- Hangs and panics on long-running write operations
- `.git` directory being read-only inside the sandbox, breaking commits
- Windows sandbox behavior diverging from macOS / Linux

Treating `-s workspace-write` as a stable abstraction in v1.0 alpha would
ship known unreliability to first users.

## Why this is debt, not a feature

agent-kit's "any AI CLI" wedge is incomplete while Codex users can only
plan but not execute writes through the agent-kit Runner abstraction.
Users who want to use Codex for blueprint execution are forced into
either:

- `claude-subagent` (Claude Code only)
- `local-worktree` (CLI-agnostic but doesn't give them Codex's reasoning)

Restoring the wedge requires `codex-exec` to handle the same `permissions:
workspace-write` tasks that `claude-subagent` handles today.

## Watch points (review every cadence)

- **Codex release notes** at https://github.com/openai/codex/releases —
  search for `sandbox`, `workspace-write`, `panic`, `hang`.
- **Codex GitHub Issues** for `sandbox_mode = workspace-write` regressions
  closed in the prior cycle.
- **Codex config docs** at https://developers.openai.com/codex/config-reference
  — watch the `[sandbox]` section for new constraints or guidance.
- **Cross-platform issues** specifically for Windows + WSL + macOS Apple
  Silicon — the `.git`-read-only failure mode has been platform-specific.

## Trigger

Resolve this item when **all of the following** are true:

- Codex sandbox stable on 3 of 3 platforms (macOS, Linux, Windows) per
  the upstream issue tracker.
- Demonstrable: 100 consecutive `codex exec -s workspace-write` runs
  against a `.git`-tracked test workspace complete without panic, hang,
  or `.git` read-only errors.
- The `compatible-versions.json` pin for Codex is on a version that
  passes the above.

## Action when triggered

1. Remove the `prepare()`-time rejection of `permissions: workspace-write`
   in `src/runners/codex-exec/index.ts`.
2. Extend the unit tests to cover the write-then-commit flow under
   mocked spawnSync.
3. Bump the `compatible-versions.json` Codex pin to the stable version.
4. Re-run the iron-rule regression fixture (Task 0.0) under codex-exec
   to verify byte-identical observable behavior.
5. Move this file to `tech-debt/resolved/` with a link to the
   implementing changeset.

## Related

- Blueprint task: `blueprints/planned/agent-kit-v1-evidence-ledger/_overview.md`
  Task 2.2 (codex-exec Runner backend).
- Outside-voice context: codex-plan-review 2026-05-11, finding
  "Codex `workspace-write` is specifically high-risk."
- Linked tech-debt: `h-004-real-codex-nightly-smoke-ci.md` (the nightly
  job is the leading signal that workspace-write is stable enough to
  un-defer).
