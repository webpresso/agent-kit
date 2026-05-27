---
type: research
status: draft
date: 2026-05-06
last_updated: '2026-05-06'
audience: agent-kit maintainers
related:
  - "webpresso/monorepo/package.json (postinstall: wp setup --overwrite)"
  - "webpresso/agent-kit/src/cli/commands/init/merge.ts"
  - "webpresso/agent-kit/catalog/agent/rules/"
---

# Research: consumer rule layering for agent-kit

## Problem

`wp setup` ships a canonical bundle of rules, skills, commands, hooks, and
templates from `agent-kit/catalog/`. Consumer repos (monorepo, ingest-lens,
public packages) need:

1. **Canonical files stay canonical.** Local edits to managed files
   (`AGENTS.md`, `.agent/rules/*.md`, `.claude/settings.json`,
   `.codex/hooks.json`, `docs/templates/*`) must not survive across `wp setup`
   runs. Agent-kit is the single source of truth.
2. **Consumer repos still need to add their own rules.** Each repo has rules
   that the catalog cannot ship — repo-specific architecture, secret-handling
   policies, bucket-boundary rules, locked-in command surfaces. These cannot
   live in `agent-kit/catalog/` because they are not universal.
3. **The mechanism must be discoverable, gitignored-aware, and
   conflict-free.** Consumers must not be tempted to edit canonical files
   "just this once" and have the change disappear silently on the next install.

Today, the only escape valve is editing canonical files in place — which is
exactly what the new `--overwrite` postinstall just disabled. So we need a
first-class layering mechanism.

## Prior art (web research, 2026-05)

Surveyed seven mature ecosystems that solve "shared canonical config + local
extensions." The patterns converge.

### 1. ESLint (flat config)

- `extends` accepts an array of locators (npm package, file path, named
  preset).
- Later entries override earlier ones; final consumer config has highest
  precedence.
- Per-key merge semantics defined: `rules` deep-merge with override, `plugins`
  array-append, `parserOptions` shallow-merge.
- `overrides[]` lets a consumer scope-narrow a rule to a glob without forking
  the base.

### 2. stylelint

- Same `extends` array model. "When one configuration extends another, it
  starts with the other's properties and then adds to and overrides what's
  there."
- `overrides[]` for path-glob-scoped layering on top.

### 3. tsconfig.json

- `extends: "@webpresso/typescript-config/base.json"` — one or many.
- Carefully-defined per-key merge: `compilerOptions` shallow-merge, `include`
  / `exclude` / `files` *replace*, `references` replace.
- The replace-vs-merge distinction is documented per field. Predictable.

### 4. Tailwind presets

- `presets: [require('./my-preset.js')]` — array.
- Per-key merge documented: `theme.extend` deep-merges, plain `theme` keys
  replace, `corePlugins` merges as object / replaces as array.
- Lesson: the merge semantics matter more than the syntax. Consumers need to
  predict whether their value augments or replaces.

### 5. Renovate presets

- `extends: ["config:recommended", "schedule:weekly", "github>org/repo"]` —
  array of named presets, file refs, or external repos.
- Presets are pure data (JSON), composable, can extend other presets
  recursively.
- "Templating presets" via Handlebars for conditional inclusion.
- Lesson: external-repo references (`github>...`) make it painless to share
  presets across orgs without npm publishing.

### 6. Claude Code settings (most directly relevant)

- Five-layer precedence: **Managed > CLI > Local > Project > User**.
- *Critical*: array-valued fields are **merged across all scopes**, not
  replaced. `permissions.allow`, `filesystem.allowWrite`,
  `filesystem.denyRead`, hook arrays, etc. all union.
- Object-valued fields override per-key.
- `.claude/settings.local.json` is git-ignored and personal; `.claude/settings.json`
  is committed and team-shared.
- Lesson: the platform agent-kit targets *already* has a layered settings
  model. Agent-kit's job is to populate the right layer.

### 7. Husky / shareable hooks

- Different shape: each consumer repo lists its own hooks in `.husky/`. There
  is no shared canonical set; teams copy-paste.
- Anti-pattern, included only as a counter-example: this is what you get
  without layering.

## Synthesis: the universal pattern

Every successful ecosystem implements:

1. **An `extends` (or `presets`, or scope-precedence) chain** with documented
   merge semantics per field.
2. **A consumer namespace that cannot collide** with the canonical namespace
   (e.g. `rules` vs `overrides`, project layer vs managed layer, `theme` vs
   `theme.extend`).
3. **Replace-vs-merge declared per field**, not by guesswork.
4. **A local-only, git-ignored layer** for personal overrides.

Agent-kit is missing #1 and #2 for everything except `.claude/settings.json`
(which inherits the platform's native layering).

## Proposed design for agent-kit

### Core idea: two-tier directory layout

Split every managed surface into a **canonical layer** owned by agent-kit and
a **consumer layer** owned by the repo. Both are read by agents; only the
canonical layer is overwritten by `wp setup`.

```
.agent/
  rules/                    # canonical — written by wp setup, --overwrite safe
    agent-guide.md
    cmd-execution.md
    blueprint-scoping.md
    ...
  rules.local/              # consumer-owned — never touched by wp setup
    bucket-boundaries.md
    secrets-on-disk.md
    .keep
  skills/                   # canonical
    pll/
    systematic-debugging/
    ...
  skills.local/             # consumer-owned
    monorepo-navigation/
    .keep
  commands/                 # canonical
    audit.md
    fix.md
    ...
  commands.local/           # consumer-owned
    just-wp.md
    .keep
```

The exact `.local` suffix is a placeholder; bikeshed candidates: `consumer/`,
`overrides/`, `local/`, `repo/`. Stylelint/ESLint precedent suggests
`overrides/` reads most naturally.

### Aggregator files agent-kit generates

For surfaces that read a single file (not a directory), agent-kit generates
an aggregator that includes both layers in deterministic order. Example:

- `AGENTS.md` (canonical sections from catalog) ends with:
  ```markdown
  <!-- wp:include-overrides .agent/agents.local.md -->
  ```
  `wp setup` re-renders `AGENTS.md` from the catalog *plus* whatever is in
  `.agent/agents.local.md`. The local file is never overwritten; the
  generated `AGENTS.md` is.

- `.claude/settings.json`: agent-kit ships
  `.claude/settings.canonical.json` (overwritten on every setup) and reads
  `.claude/settings.local.json` (consumer-owned). The Claude Code layering
  already merges these natively — agent-kit only needs to populate the right
  file.

- `.codex/hooks.json`: same approach. Canonical hooks in
  `.codex/hooks.canonical.json`; consumer hooks in `.codex/hooks.local.json`;
  `wp setup` regenerates `.codex/hooks.json` as the merged output.

### Symlinks where possible

For per-IDE surfaces (`.cursor/commands/`, `.gemini/commands/`,
`.windsurf/commands/`), continue the existing symlink approach
(`wp symlink sync`). Symlinks make drift physically impossible — editing the
file edits the source.

For canonical files outside the per-IDE mirror, evaluate symlinking into
`node_modules/@webpresso/agent-kit/dist/catalog/...`. Pros: zero drift,
auto-updates with the package. Cons: requires consumers to install via npm
(true today) and to commit symlinks (most teams already do for `.cursor/`).

### Banner + audit, not just policy

Every canonical file emitted by `wp setup` should carry a header:

```markdown
<!--
  Managed by @webpresso/agent-kit. Do not edit.
  Overrides go in .agent/rules.local/<name>.md.
  Edit the catalog at https://github.com/webpresso/agent-kit/catalog/agent/rules/<name>.md
  and republish via changeset.
-->
```

Reinforce with `wp audit managed-file-drift`: CI gate that hashes each
canonical file against the catalog and fails if they diverge. With
`--overwrite` on postinstall, drift is rare anyway, but the audit makes the
expectation explicit and catches "I edited it during a debug session and
forgot."

### CLI surface additions

```bash
wp rules add <name>                   # scaffolds .agent/rules.local/<name>.md with frontmatter
wp rules list                         # lists canonical + local rules with source
wp audit managed-file-drift           # CI gate
wp audit managed-file-drift --fix     # rewrites canonical files from catalog (alias for wp setup --overwrite scoped to managed files)
```

`wp rules add` is the discoverability primitive. A consumer who wants to add
a rule runs `wp rules add bucket-boundaries`, gets a templated stub in
`.agent/rules.local/bucket-boundaries.md`, edits it, commits it. The path is
gitignored-aware (`.agent/` is currently gitignored in monorepo; the `.local`
subdirs would need to be excepted via `!.agent/rules.local/`).

### Merge semantics — declared explicitly

| Surface | Canonical | Consumer | Merge |
| ------- | --------- | -------- | ----- |
| `.agent/rules/` | catalog | `.agent/rules.local/` | union (both are loaded) |
| `.agent/skills/` | catalog | `.agent/skills.local/` | union |
| `.agent/commands/` | catalog | `.agent/commands.local/` | union |
| `AGENTS.md` | template render | `.agent/agents.local.md` appended | concat with delimiter |
| `.claude/settings.json` | `.claude/settings.canonical.json` | `.claude/settings.local.json` | platform-native deep merge |
| `.codex/hooks.json` | `.codex/hooks.canonical.json` | `.codex/hooks.local.json` | array append for `hooks[*]`, deep merge elsewhere |
| `docs/templates/` | catalog | `docs/templates.local/` | union (consumer template wins on filename collision) |

For union surfaces (rules / skills / commands / templates), consumers can
also **shadow** a canonical entry by name: `.agent/rules.local/agent-guide.md`
takes precedence over `.agent/rules/agent-guide.md`. Discouraged but
supported as the escape hatch for the rare "we genuinely cannot live with
the canonical version" case. `wp audit shadowed-rules` lists shadows so they
stay visible at review time.

## Migration path

The current state:

- `monorepo/package.json#postinstall` runs `wp setup --yes --overwrite`.
- Local edits to managed files are now silently clobbered.
- Consumers have no clean place to add repo-specific rules.

Phased rollout:

1. **Phase 1 — agent-kit ships the layering mechanism.** Add `.local`
   directory loading to the rules/skills/commands surfaces. Add the
   `wp:include-overrides` directive to `AGENTS.md` template. Add the
   `.canonical.json` + `.local.json` split for `.claude/settings.json` and
   `.codex/hooks.json`. Document merge semantics.
2. **Phase 2 — consumers migrate edits.** For each consumer (monorepo,
   ingest-lens), grep for diffs between catalog and consumer-installed files.
   Move each delta into `.local`. Run `wp audit managed-file-drift` —
   should be clean.
3. **Phase 3 — banner + audit enforcement.** Ship the banner header and
   `wp audit managed-file-drift` CI gate. Drift now fails CI.
4. **Phase 4 — `wp rules add` scaffolding.** Discoverability primitive.
   Update CLAUDE.md / agent-kit README to document the layering.

Phase 1 is a single agent-kit minor version bump. Phases 2-4 are
per-consumer rollouts that don't block agent-kit releases.

## Trade-offs honestly

**Where this design is right:**

- Matches the universal pattern across ESLint, stylelint, tsconfig, Tailwind,
  Renovate, Claude Code. Consumers familiar with any of these read the
  layout immediately.
- Eliminates the silent-clobber surprise: consumer rules live in a separate
  directory and are physically untouched by `wp setup`.
- Discoverability via `wp rules add` removes the "where do I put this?"
  question that drives in-place edits.
- `wp audit managed-file-drift` makes the policy machine-checkable.

**Where it has cost:**

- Extra directory clutter (`.local` siblings of every canonical dir). Could
  be hidden behind `.agent/overrides/{rules,skills,commands}/` but that
  trades clutter for nesting.
- Aggregator generation for `AGENTS.md` adds a small build step at setup
  time. Currently `AGENTS.md` is a static copy; making it a render adds a
  template engine dependency. Mitigatable by using simple include directives
  parsed during setup.
- Shadowing (consumer overriding a canonical rule by name) is a foot-gun.
  Audit makes it visible but does not prevent it. Could be locked behind a
  `--allow-shadow` flag in `wp rules add`.
- The split `.claude/settings.canonical.json` + `.claude/settings.local.json`
  is one extra file to track per consumer. Native Claude Code layering
  resolves it transparently at runtime, but the file structure is
  agent-kit-imposed and requires explanation.

**What this does *not* solve:**

- Consumer rules that need to *delete* a canonical rule (rather than augment
  or shadow). Stylelint handles this via `rules: { "<name>": null }`;
  agent-kit could grow a `.agent/rules.disabled.md` listing rule names to
  suppress, but this is a future extension. For now, shadowing with an
  empty file approximates it.
- Versioning of consumer rules against agent-kit catalog versions. If
  agent-kit removes a canonical rule, consumer rules referencing it by name
  may go stale. Audit could catch this.

## Recommendation

Ship Phase 1 in agent-kit `0.4.0` as a minor (additive) release. The
overwrite policy stays in `monorepo/package.json#postinstall` — that is
correct and complementary. Once Phase 1 lands, monorepo migrates its
existing local edits into `.agent/rules.local/` and the layering becomes the
documented escape valve.

Filing this as a draft blueprint at
`webpresso/agent-kit/blueprints/draft/consumer-rule-layering/` is the next
step if the direction is approved.
