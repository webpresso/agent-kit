---
type: guide
last_updated: '2026-04-25'
---

# Symlinker

The symlinker keeps per-IDE command/skill surfaces in sync with a canonical
`.agent/` source of truth. It ships defaults for Claude Code, Cursor,
Windsurf, OpenCode, Codex, Amp, and Gemini CLI, and is designed so new
consumers plug in via configuration.

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
  not a target for agent-kit skills.
- **Windsurf:** `.windsurf/commands/*.md`. Same story as Cursor for rules.
- **Gemini CLI:** `.gemini/commands/*.toml` (TOML, not markdown — with
  `{{args}}` templating instead of `$ARGUMENTS`).

Because Codex + Amp + OpenCode-fallback all converge on `.agents/skills/`,
the symlinker ships **two skill surfaces that cover four tools**:
`.claude/skills` (directory-symlink for Claude + OpenCode-fallback) and
`.agents/skills/<name>` (per-skill symlinks for Codex + Amp +
OpenCode-fallback). No per-tool `.codex/skills/` or `.opencode/skills/`
entries are needed.

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

### Skill symlinks — two modes

Skills under `.agent/skills/<name>/` are published in one of two modes,
picked per consumer:

**Directory mode** — one symlink at `.claude/skills` pointing at the whole
`../.agent/skills` directory. Cheapest, but assumes the consumer owns the
entire skills directory (no coexistence with third-party skills). This
single symlink also serves OpenCode, which reads `.claude/skills/` as a
project-local fallback.

**Per-skill mode** — one symlink per skill, e.g. `.agents/skills/<name>`
→ `../../.agent/skills/<name>`. Used for the convergent `.agents/skills/`
directory that Codex + Amp + OpenCode-fallback all read, because that
directory may already contain third-party or consumer-owned skills;
per-skill mode creates links only for names that exist in
`.agent/skills/`, leaving consumer-owned directories alone. If a
consumer-owned directory collides with an agent-kit skill name, the
symlinker warns and skips rather than clobbering it.

Editors on macOS and Linux follow symlinks natively. Windows requires
Developer Mode or admin privileges for `CreateSymbolicLink`; consumers on
Windows who run into this should run from a shell with symlink privileges or
use `ak symlink check` in CI to detect drift before committing.

### TOML consumer (`.gemini`)

Gemini CLI doesn't follow symlinks reliably and wants TOML with
double-brace `{{args}}` templating. For each `.agent/commands/<name>.md`,
the symlinker:

1. Parses the markdown's YAML frontmatter + body.
2. Writes `.gemini/commands/<name>.toml` with:
   ```toml
   description = "<frontmatter.description>"
   prompt = """
   <markdown body, with $ARGUMENTS → {{args}} substituted>
   """
   ```
3. Deletes `.gemini/commands/*.toml` whose source `.md` no longer exists
   (stale-artifact cleanup).

## Commands

### `ak symlink sync`

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

### `ak symlink check`

Same work as `sync`, but **exits non-zero** if anything was out of sync.
Use in pre-commit / CI to fail loudly on drift:

```bash
# .husky/pre-commit
npx ak symlink check
```

```yaml
# .github/workflows/ci.yml
- name: Agent surface sync check
  run: npx ak symlink check
```

If the check fails, run `ak symlink sync` locally and commit the output.

## Consumers & their defaults

Defined in `src/symlinker/consumers.ts`:

```typescript
export const DEFAULT_CONSUMERS: ConsumerConfig[] = [
  { dir: '.claude/commands',   sourcePrefix: '../../.agent/' },
  { dir: '.cursor/commands',   sourcePrefix: '../../.agent/' },
  { dir: '.windsurf/commands', sourcePrefix: '../../.agent/' },
  { dir: '.opencode/commands', sourcePrefix: '../../.agent/' },
]

// Directory-mode: one whole-directory symlink per consumer.
// Serves Claude Code + OpenCode-fallback discovery.
export const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[] = [
  { linkPath: '.claude/skills', target: '../.agent/skills' },
]

// Per-skill mode: one symlink per skill. `.agents/skills/` is the
// convergent project path shared by Codex (official), Amp (official),
// and OpenCode (fallback) — one entry covers three tools.
export const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[] = [
  { dir: '.agents/skills', sourcePrefix: '../../.agent/skills/' },
]
```

To add a new consumer (e.g., a future CLI tool), either:

- Send a PR to agent-kit adding an entry to `DEFAULT_CONSUMERS`,
  `DEFAULT_SKILLS_CONSUMERS`, or `DEFAULT_PER_SKILL_CONSUMERS` (pick the
  mode that matches the tool's skill-directory semantics) so all repos
  pick it up.
- Or override in your `.agent-kitrc.json` for a repo-local customization
  (planned).

`.gemini/commands/` is **not** in `DEFAULT_CONSUMERS` because it's a
TOML-transform consumer (handled by `syncGeminiCommands`), not a
symlink consumer.

## What counts as "out of sync"

The symlinker flags drift when:

- A `.agent/commands/<x>.md` exists but `.claude/commands/<x>.md` does not
  (missing symlink).
- `.claude/commands/<x>.md` exists and is a regular file (not a symlink) —
  the symlinker removes it and re-links. **Warning:** if you've manually
  edited the file thinking you were editing the source, those edits get
  lost. `ak symlink check` catches this before it happens.
- `.claude/commands/<x>.md` exists as a symlink pointing at the wrong
  target (e.g., after restructuring `.agent/`).
- `.claude/commands/<x>.md` exists but no corresponding `.agent/` source
  does (stale symlink after deleting a command).

`.gemini/commands/<x>.toml` drift: TOML contents differ from what
transformation of the current `.md` would produce.

## `ALLOWED_REAL_FILES`

Some consumer directories are allowed to hold real (non-symlink) files
alongside agent-sourced symlinks — typically `.markdownlint.json` in
`.claude/commands/` to quiet lint on the generated files. These paths
are listed in `ALLOWED_REAL_FILES` in `consumers.ts`; the symlinker
leaves them alone.

## Library API

For programmatic use (e.g., custom tooling, tests):

```typescript
import {
  syncAll,
  syncConsumer,
  syncSkills,
  syncSkillsConsumer,
  syncPerSkillConsumer,
  syncPerSkillConsumers,
  syncGeminiCommands,
  isAgentOrConsumerFile,
  type ConsumerConfig,
  type SkillsConsumerConfig,
  type PerSkillConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  DEFAULT_PER_SKILL_CONSUMERS,
} from '@webpresso/agent-kit/symlinker'

const fixes = syncAll(repoRoot)
if (fixes > 0) console.log(`Fixed ${fixes} symlinks`)
```

## Limitations

- **Windows filesystem symlinks** require elevated permissions. A future
  `--copy` mode would write regular files instead of symlinks; drift
  detection would rely on content diffs. Not yet implemented.
- **Gemini CLI `{{args}}` templating** is the only supported
  transformation. Other runtimes with non-markdown formats need their
  own converter alongside the TOML writer.
- **`.gitignore` interactions.** Symlinks must be committed to git to
  reach CI and other contributors. Don't add `.claude/commands/` to
  `.gitignore` — commit it.
