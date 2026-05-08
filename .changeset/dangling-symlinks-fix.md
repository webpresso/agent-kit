---
'@webpresso/agent-kit': minor
---

Eliminate the dangling-symlink class in `.agents/skills/` and harden `ak setup`
against partial / non-local installs.

**Fix:** `ak setup` no longer emits broken symlinks under
`.agents/skills/<slug>/<file>` when the skill's source path is missing.
The legacy `syncPerSkillConsumer` writer had an asymmetric fallback (listing
fell back to `.agent/skills/`, but symlink targets pointed at the missing
`node_modules/.../skills/`), so it would print `✅` while leaving every
symlink dangling. The replacement `syncSkillFanout` resolves source from
`.agent/skills/<slug>/` only, walks recursively to support nested asset
files (e.g. `tanstack-query/references/`, `systematic-debugging/CREATION-LOG.md`),
and reuses `isSymlinkPointingTo` for idempotency.

**Fix:** `ak setup` and `ak sync` now exit 1 with an actionable message
when `@webpresso/agent-kit` is missing from the consumer's `node_modules/`
(e.g. after a failed `pnpm install` or a yanked dependency).

```
ak init: @webpresso/agent-kit not installed in node_modules.
Run `pnpm install` first.
```

Previously, `loadContent`'s technical "catalogDir does not exist" error
surfaced through to the user without rewrite.

**Breaking:** `.agents/skills/` is now exclusively managed by agent-kit.
Top-level directories that don't correspond to a skill in `.agent/skills/`
are removed recursively on next `ak setup`. Each removal logs to stderr
(`Removed unexpected directory: .agents/skills/<slug>`) so the action is
never silent. The legacy writer was conservative — it only removed empty
stale directories — but the contract was always "agent-kit owns this
path" (see the `# managed by @webpresso/agent-kit (skill-sync)` block in
your `.gitignore`). If you have hand-curated content under
`.agents/skills/<slug>/`, move it to a slug name not in `.agent/skills/`
or relocate it outside the directory.

**Breaking:** `ak setup` now expects `@webpresso/agent-kit` to be
installed in the consumer's `node_modules/`. Running via a global
install (e.g. a manual symlink in `/opt/homebrew/bin/ak` or
`pnpm install -g @webpresso/agent-kit`) is no longer supported in
silence: setup prints a stderr warning when the running CLI does not
live under `<repoRoot>/node_modules/`. The warning is non-blocking, but
the global-install path produced non-reproducible setups (symlinks
resolving to whatever version was globally installed; lockfile irrelevant)
and is being deprecated. Pin `@webpresso/agent-kit` as a local dep and
run via `pnpm exec ak setup`.

**Internal:** Dropped `sourceRootDir` and `sourcePrefix` from
`PerSkillConsumerConfig`. The legacy `syncPerSkillConsumer` /
`syncPerSkillConsumers` exports are renamed to `syncSkillFanout` /
`syncSkillFanouts` and now return `{ wrote: number }` instead of a bare
number. `isSymlinkPointingTo` is now exported from
`@webpresso/agent-kit/symlinker/unified-sync` for reuse across writers.
