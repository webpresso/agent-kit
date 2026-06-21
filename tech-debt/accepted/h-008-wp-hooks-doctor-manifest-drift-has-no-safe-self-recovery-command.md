---
type: tech-debt
status: accepted
severity: medium
category: complexity
review_cadence: monthly
last_reviewed: '2026-06-19'
created: '2026-06-19'
linked_blueprints: []
affected_modules:
  - src/cli/commands/hooks (doctor / manifest reconcile)
  - src/cli/commands/init (setup self-repo guard)
---

# wp hooks doctor manifest drift has no safe self-recovery command

## Symptom

`wp hooks doctor` reports a persistent failing check on developer machines whose
`.claude/settings.json` has been customized beyond what `wp setup` recorded:

```
[ ] hooks manifest: 7 missing (claude/Stop, …); 19 unknown (claude/Stop, …)
    — run `wp setup --restore-hooks --source-maintenance`;
    — hand-edited? review with `wp hooks status`
```

This is bookkeeping drift between `.webpresso/hooks-manifest.json` and the live
`.claude/settings.json` — **not** a functional failure. `wp hooks status`
confirms all managed hooks (6 Claude + 6 Codex) are installed and enforcing.
The "unknown" entries are legitimate coexisting third-party hooks (gstack, OMC,
rtk) plus consumer-added entries (e.g. `check-gstack*` presence guards) and
`PATH=`-prefixed command forms that the manifest does not record.

## Why there is no safe self-recovery path

Neither remediation the doctor suggests is safe on the agent-kit self-repo:

- `wp setup` (and `--restore-hooks`, `--dry-run`) **refuse to run** here without
  `--source-maintenance`. The guard message: "running setup here overwrites the
  canonical sources under `catalog/` and the tracked `.agent`/`.claude`
  surfaces." So the gated path is a destructive maintainer operation, not a
  reconcile.
- `--restore-hooks` reconciles *manifest → live*, which would **strip**
  consumer-added entries that are absent from the manifest (e.g. the
  `check-gstack*` hooks), since the manifest is the authority in that direction.
- There is **no command that reconciles the other direction** (regenerate the
  manifest from current live `settings.json`), nor one that simply marks the
  third-party "unknown" entries as expected so the check can pass.

Net: an operator on the self-repo (or any repo with customized hooks) is left
with a permanently red doctor check and no non-destructive way to clear it.

## Impact

- Erodes trust in `wp hooks doctor` as the canonical post-setup success signal —
  a red check that is actually benign trains operators to ignore the doctor.
- The only documented fixes are either guarded (`--source-maintenance`,
  overwrites tracked sources) or lossy (`--restore-hooks`, drops divergent
  consumer hooks).

## Discovered via

Investigating a real "session start gstack — no such file" error
(2026-06-19). Root cause was unrelated (two `check-gstack*` hook scripts
referenced by `.claude/settings.json` were missing from the main clone's
`.claude/hooks/` — restored from a worktree copy). The manifest-drift check
surfaced during the same `wp hooks doctor` run and has no clean remediation.

## Remediation approaches (not yet chosen)

1. Add a non-destructive `wp hooks doctor --reconcile` (or `wp hooks
   sync-manifest`) that regenerates `.webpresso/hooks-manifest.json` from the
   live `settings.json`, preserving divergent consumer entries.
2. Teach the manifest check to classify known third-party hook families
   (gstack, OMC, rtk) as expected `unknown` entries so they do not count as
   drift.
3. Make the doctor distinguish "functional failure" from "bookkeeping drift" so
   the latter is a warning, not a `[ ]` failure.
