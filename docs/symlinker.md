---
type: guide
last_updated: '2026-06-13'
---

# Symlinker

The symlinker keeps per-IDE command/skill surfaces in sync with a canonical
`.agent/` source of truth. It ships defaults for Claude Code, Cursor,
Windsurf, OpenCode, Codex, and Amp, and is designed so new consumers plug
in via configuration.

## Why

Each AI-coding tool has its own file layout for slash-commands and skills.
The good news in 2026: skills are converging. Anthropic open-standardized
`SKILL.md` in December 2025, OpenAI adopted it for Codex, and OpenCode
implemented it with compatibility fallbacks into `.claude/skills/` and
`.agents/skills/`. Practical directory map:

- **Claude Code:** `.claude/commands/*.md`, `.claude/skills/<name>/SKILL.md`.
- **Codex CLI:** `.agents/skills/<name>/SKILL.md` (scanned from CWD up to
  repo root per [OpenAI's "Where to save skills"](https://developers.openai.com/codex/skills)).
  Codex's older `.codex/prompts/*.md` custom-prompt surface is deprecated
  and was home-only (`~/.codex/prompts/`) — the symlinker deliberately
  does not target it.
- **OpenCode:** `.opencode/commands/*.md`, `.opencode/skills/<name>/SKILL.md`,
  with fallback discovery into `.claude/skills/` and `.agents/skills/`.
- **Amp (Sourcegraph):** `.agents/skills/<name>/SKILL.md`.
- **Cursor:** `.cursor/commands/*.md`. Cursor's skills-analogous surface
  is `.cursor/rules/*.mdc` (always-applied rules, different semantics) —
  not a target for webpresso skills.
- **Windsurf:** `.windsurf/commands/*.md`. Same story as Cursor for rules.

Agent-kit now uses **one primary skill channel per host**. Claude Code and
Codex get reusable webpresso skills through their native plugin channels;
project skill-directory projection is only an explicit fallback
(`WP_SKIP_CLAUDE_PLUGIN=1` / `WP_SKIP_CODEX_PLUGIN=1`). OpenCode gets its
primary `.opencode/skills/<name>/SKILL.md` project root because its official
discovery also reads Claude-compatible and agent-compatible fallbacks; using
only the primary root avoids duplicate skill listings. The canonical
`.agent/skills/` source-of-truth is still always projected, but host-visible
skill directories are host-gated.

Without a sync layer, contributors hand-maintain N copies of every
command. The symlinker makes `.agent/` the one place to edit, and keeps
the consumer-specific surfaces derived.

## How

### Per-file command/workflow symlinks

For each markdown file at `.agent/commands/<name>.md` or
`.agent/workflows/<name>.md`, the symlinker creates a **relative filesystem
symlink** at each consumer's command directory pointing back at the
`.agent/` source. Example: `.claude/commands/<name>.md` →
`../../.agent/commands/<name>.md`. Same pattern for `.cursor/commands/`,
`.windsurf/commands/`, and `.opencode/commands/`.

### Skill symlinks — plugin-first, host-gated

Skills under `.agent/skills/<name>/` are projected to host-visible
directories only when that host needs a filesystem channel:

- `.agent/skills/<name>` is the repo-local canonical projection and is always
  created from catalog and consumer-owned skill sources.
- `.opencode/skills/<name>` is created when OpenCode is selected, using
  OpenCode's primary project skill root.
- `.claude/skills/<name>` and `.agents/skills/<name>` are fallback-only for
  Claude and Codex respectively. They are created only when the matching
  plugin channel is opted out with `WP_SKIP_CLAUDE_PLUGIN=1` or
  `WP_SKIP_CODEX_PLUGIN=1`.

This keeps Codex and Claude on their plugin distribution path by default,
prevents duplicate skill listings, and still provides a deterministic
repo-local fallback for environments that intentionally disable plugins.

Editors on macOS and Linux follow symlinks natively. Windows requires
Developer Mode or admin privileges for `CreateSymbolicLink`; consumers on
Windows who run into this should run from a shell with symlink privileges or
use `wp sync --check` in CI to detect drift before committing.

### Evidence-backed agent overlays

`wp sync` also performs a validation-only pass over optional
`agent-overlays/<cli>/manifest.yaml` files. Overlays are the dormant harness
extension point for future CLI-specific deltas: they must name the target CLI,
list affected harness surfaces, cite local evidence files, and avoid target
collisions with other overlays or `catalog/agent/` canonical content.

Current behavior is deliberately conservative: valid overlay manifests are
reported as validated, invalid manifests block sync, and no overlay files are
projected into generated host surfaces yet. The first projected overlay should
only ship after `wp audit weakness-mining`, the harness gate, and
`wp audit harness-overlay-evidence` prove a concrete supported-CLI behavior gap.

Minimal manifest shape:

```yaml
version: 1
cli: codex
surfaces:
  - generated-agent-surfaces
evidence:
  - evidence.md
files:
  - source: prompt.md
    target: overlays/codex/prompt.md
```

## Commands

### `wp sync`

Writes symlinks and regenerates TOML. Idempotent — safe to run
repeatedly. Reports:

```
🔗 Syncing agent command/workflow symlinks...
   Found 17 source files in .agent/
  ✅ verify.md → ../../.agent/commands/verify.md
  ✅ tph.md → ../../.agent/commands/tph.md
  ...
  ✅ All agent command/workflow/skill symlinks are properly configured
```

### `wp sync --check`

Same work as `sync`, but **exits non-zero** if anything was out of sync.
Use in pre-commit / CI to fail loudly on drift:

```bash
# .husky/pre-commit
wp sync --check
```

```yaml
# .github/workflows/ci.yml
- name: Agent surface sync check
  run: wp sync --check
```

If the check fails, run `wp sync` locally and commit the output.

## Consumers & their defaults

Defined in `src/symlinker/consumers.ts`:

```typescript
export const DEFAULT_CONSUMERS: ConsumerConfig[] = [
  // Primary command surfaces are distributed through native channels.
]

export const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[] = [
  // Claude skills are delivered by the Claude Code plugin by default.
]

export const DEFAULT_UNIFIED_CONSUMERS: readonly UnifiedConsumerConfig[] = [
  { id: 'agent-rules', dir: '.agent/rules', acceptsKind: 'rule', strategy: 'symlink' },
  { id: 'agent-skills', dir: '.agent/skills', acceptsKind: 'skill', strategy: 'symlink' },
  { id: 'cursor-rules', dir: '.cursor/rules', acceptsKind: 'rule', strategy: 'copy' },
  { id: 'windsurf-skills', dir: '.windsurf/skills', acceptsKind: 'skill', strategy: 'copy' },
  { id: 'claude-rules', dir: '.claude/rules', acceptsKind: 'rule', strategy: 'symlink' },
  { id: 'opencode-skills', dir: '.opencode/skills', acceptsKind: 'skill', strategy: 'symlink', host: 'opencode' },
]

export const PLUGIN_FALLBACK_SKILL_CONSUMERS: readonly UnifiedConsumerConfig[] = [
  { id: 'claude-skills', dir: '.claude/skills', acceptsKind: 'skill', strategy: 'symlink', host: 'claude', pluginHost: true },
  { id: 'portable-skills', dir: '.agents/skills', acceptsKind: 'skill', strategy: 'symlink', host: 'codex', pluginHost: true },
]
```

To add a new consumer (e.g., a future CLI tool), either:

- Send a PR to webpresso adding an entry to `DEFAULT_UNIFIED_CONSUMERS`
  (primary host channel) or `PLUGIN_FALLBACK_SKILL_CONSUMERS` (explicit
  plugin opt-out fallback) so all repos pick it up.
- Or override in your `.webpressorc.json` for a repo-local customization
  (planned).

## What counts as "out of sync"

The symlinker flags drift when:

- A selected host's generated rule/skill surface is missing, stale, or
  points outside the canonical `.agent/` source tree.
- A generated fallback skill directory exists for a plugin host even though
  the plugin is active; plugin hosts should expose one skill channel.
- A generated entry remains after the source skill/rule is removed.

## `ALLOWED_REAL_FILES`

Some consumer directories are allowed to hold real (non-symlink) files
alongside agent-sourced symlinks — typically `.markdownlint.json` in
`.claude/commands/` to quiet lint on the generated files. These paths
are listed in `ALLOWED_REAL_FILES` in `consumers.ts`; the symlinker
leaves them alone.

## What to track vs ignore under `.claude/`

- **Track** deliberate repo-owned source surfaces such as `agent-rules/`,
  `agent-skills/`, and catalog content.
- **Ignore** generated/runtime-only subpaths such as `.claude/rules/`,
  `.claude/skills/`, `.claude/worktrees/`, and local scheduler/runtime state.
- Avoid blanket `.claude/` ignores in shared defaults unless the repo
  intentionally wants the entire directory local-only; blanket ignores can hide
  deliberate committed instruction surfaces.

## Library API

For programmatic use (e.g., custom tooling, tests):

```typescript
import {
  syncAll,
  syncConsumer,
  syncSkills,
  syncSkillsConsumer,
  syncSkillFanout,
  syncSkillFanouts,
  isAgentOrConsumerFile,
  type ConsumerConfig,
  type SkillsConsumerConfig,
  type PerSkillConsumerConfig,
  type SyncSkillFanoutResult,
  DEFAULT_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  DEFAULT_PER_SKILL_CONSUMERS,
} from 'webpresso/symlinker'

const fixes = syncAll(repoRoot)
if (fixes > 0) console.log(`Fixed ${fixes} symlinks`)

// Per-skill fanout returns a structured result (replaces the legacy bare-number
// `syncPerSkillConsumer`/`syncPerSkillConsumers` API; renamed to fix the
// dangling-symlink class — see CHANGELOG entry "Eliminate the dangling-symlink
// class in .agents/skills/").
const result: SyncSkillFanoutResult = syncSkillFanouts(repoRoot)
console.log(`syncSkillFanouts: wrote ${result.wrote} entries`)
```

## Limitations

- **Windows filesystem symlinks** require elevated permissions. A future
  `--copy` mode would write regular files instead of symlinks; drift
  detection would rely on content diffs. Not yet implemented.
- **`.gitignore` interactions.** Symlinks must be committed to git to
  reach CI and other contributors. Don't add `.claude/commands/` to
  `.gitignore` — commit it.
