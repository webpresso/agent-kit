# Symlinker

The symlinker keeps per-IDE command/skill surfaces in sync with a canonical
`.agent/` source of truth. Agentkit currently knows about four consumers —
Claude Code, Cursor, Windsurf, and Gemini CLI — and is designed so new
consumers plug in via configuration.

## Why

Each AI-coding tool has its own file layout for slash-commands and skills:

- **Claude Code:** `.claude/commands/*.md`, `.claude/skills/<name>/SKILL.md`
- **Cursor:** `.cursor/commands/*.md`
- **Windsurf:** `.windsurf/commands/*.md`
- **Gemini CLI:** `.gemini/commands/*.toml` (TOML, not markdown — with
  `{{args}}` templating instead of `$ARGUMENTS`)

Without a sync layer, contributors hand-maintain N copies of every
command. The symlinker makes `.agent/` the one place to edit, and keeps
the consumer-specific surfaces derived.

## How

### Symlink consumers (`.claude`, `.cursor`, `.windsurf`)

For each markdown file at `.agent/commands/<name>.md` or
`.agent/workflows/<name>.md`, the symlinker creates a **relative
filesystem symlink** at `.claude/commands/<name>.md` →
`../../.agent/commands/<name>.md` (and the same pattern for
`.cursor/commands/` and `.windsurf/commands/`).

Skills under `.agent/skills/<name>/` get the same treatment —
`.claude/skills/<name>` is a symlink pointing at
`../../.agent/skills/<name>`.

Editors on macOS and Linux follow symlinks natively. Windows requires
Developer Mode or admin privileges for `CreateSymbolicLink`; consumers on
Windows who run into this can use `ak symlink sync --copy` instead
(planned — see [limitations](#limitations)).

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

### `ak symlink sync --dry-run` *(planned)*

Previews changes without writing.

## Consumers & their defaults

Defined in `src/symlinker/consumers.ts`:

```typescript
export const DEFAULT_CONSUMERS: ConsumerConfig[] = [
  { dir: '.claude/commands',   sourcePrefix: '../../.agent/' },
  { dir: '.cursor/commands',   sourcePrefix: '../../.agent/' },
  { dir: '.windsurf/commands', sourcePrefix: '../../.agent/' },
]

export const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[] = [
  { dir: '.claude/skills', sourcePrefix: '../../.agent/skills/' },
]
```

To add a new consumer (e.g., a future CLI tool), either:

- Send a PR to agent-kit adding an entry to `DEFAULT_CONSUMERS` so all
  repos pick it up.
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
  syncGeminiCommands,
  isAgentOrConsumerFile,
  type ConsumerConfig,
  type SkillsConsumerConfig,
  DEFAULT_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
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
