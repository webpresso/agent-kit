---
type: blueprint
status: draft
complexity: XS
created: '2026-05-14'
last_updated: '2026-05-14'
progress: '0% (drafted)'
depends_on: []
tags: [license, context-mode, elv2, urgent]
---

# Make context-mode an opt-in dependency in agent-kit (drop ELv2 risk this week)

**Goal:** Eliminate the ELv2 license risk for ozby/ingest-lens — and any
other agent-kit consumer — TODAY by making `context-mode` an explicit
opt-in instead of a default-loaded plugin. Consumers who currently load
context-mode through agent-kit's surface get a one-line config to keep
using it; consumers who don't want ELv2 in their tree can simply not opt
in. Splits the urgent compliance question from the larger replacement
work tracked in
`replace-context-mode-plugin-with-v1-session-memory-mit-stack-...`.

## Provenance

This blueprint exists because the eng-review of the broader replacement
plan (2026-05-14) surfaced via Codex outside-voice that conflating
"remove ELv2 risk" with "ship full MIT replacement" was sequencing two
unrelated jobs. Per Codex's strategic simplification finding: ship the
optionality first, build the replacement when it's ready.

## Product wedge anchor

- **Stage outcome:** ozby/ingest-lens removes `context-mode` from its
  agent dependency surface within days, not weeks. ELv2 risk eliminated
  for the reference consumer immediately. Public-package extraction
  story unblocked for any third-party that was waiting on the license
  question.
- **Consuming surface:** ozby/ingest-lens `package.json` and any
  agent-kit-driven repo. Consumers explicitly choose whether to add
  `context-mode` to their plugin set via a documented config flag.
- **New user-visible capability:** consumers can run agent-kit in a
  fully-MIT plugin configuration. Those who need `context-mode` for
  `ctx_fetch_and_index` / operator tools opt in with one line of
  config; those who don't, get a clean dep tree.

## Architecture Overview

```text
BEFORE:
  agent-kit (consumer install)
    └── plugin surface includes context-mode by default
          (consumers inherit ELv2 dep regardless of intent)

AFTER:
  agent-kit (consumer install)
    └── plugin surface = MIT-only by default
          └── opt-in: WP_PLUGINS=context-mode  (or config flag)
                └── consumer explicitly adds context-mode → loaded
```

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.3 | None | 2 agents |
| **Wave 1** | 1.2, 1.4 | 1.1 | 2 agents |
| **Critical path** | 1.1 → 1.2 | — | 2 waves |

### Phase 1: Optionality + handoff [Complexity: XS]

#### [infra] Task 1.1: Audit + remove default context-mode loading from agent-kit surface

**Status:** todo

**Depends:** None

Locate every place in agent-kit's plugin/catalog surface where
`context-mode` is loaded, listed as a default plugin, or installed as a
peer/dependency. Remove from defaults; preserve the opt-in path. Likely
surfaces:

- `.claude-plugin/plugin.json` `mcpServers` block
- `catalog/` manifests that enumerate default tools/plugins
- `package.json` `dependencies` / `peerDependencies` entries
- Any `wp setup` recipe that auto-installs context-mode

Make the opt-in mechanism explicit: a documented env var
(`WP_PLUGINS=context-mode`), config file flag, or section in
`wp setup --with` so that consumers wanting context-mode get a clear
one-line path.

**Files:**

- Modify: `.claude-plugin/plugin.json` (likely)
- Modify: `package.json` (if context-mode is a runtime dep)
- Modify: `catalog/` manifests (if applicable)
- Modify: `src/cli/setup.ts` or equivalent (if `wp setup` auto-wires it)

**Steps (TDD):**

1. Grep agent-kit for every reference to `context-mode` across `src/`,
   `catalog/`, `.claude-plugin/`, root `package.json`.
2. Categorize each: required-by-default vs opt-in vs documentation-only.
3. Write failing test asserting that a fresh `wp setup` (or equivalent
   plugin enumeration command) does NOT include `context-mode` by
   default.
4. Move every default reference behind an opt-in flag. Remove from
   `dependencies`; add to `optionalDependencies` or `peerDependenciesMeta`
   only if needed.
5. Re-run test → PASS.
6. Add a positive-path test: with `WP_PLUGINS=context-mode` set, the
   plugin IS loaded.

**Acceptance:**

- [ ] `wp setup` (default invocation) does not pull or load `context-mode`
- [ ] Documented opt-in path works end-to-end
- [ ] Negative + positive tests both green
- [ ] No regression in existing agent-kit behavior for consumers who
      DO opt in
- [ ] `wp audit catalog-drift` clean

#### [docs] Task 1.2: Migration note + opt-in instructions in README

**Status:** todo

**Depends:** Task 1.1

Add a clear README section: "context-mode is now opt-in. To keep using
`ctx_*` tools, add this one-liner to your config: …". Cover both Claude
Code (`enabledPlugins`) and Codex (`[mcp.servers.context-mode]`) flows.
Cross-link to the broader replacement BP so consumers know the MIT path
is in flight.

**Files:**

- Modify: `README.md`
- Create: `docs/migration/context-mode-opt-in.md`

**Acceptance:**

- [ ] README has a "context-mode is now opt-in" section near the top
- [ ] Migration doc shows exact one-liners for Claude Code and Codex
- [ ] `wp audit docs-frontmatter` passes

#### [infra] Task 1.3: Cross-repo issue for ozby/ingest-lens

**Status:** todo

**Depends:** None

File a tracked issue against ozby/ingest-lens with the exact diff
needed to drop `context-mode` from the consumer side once Task 1.1
ships:

- Remove `context-mode` from `package.json` dependencies / catalog
- If any workflow uses `ctx_fetch_and_index` specifically, document
  the temporary opt-in (until BP B ships the MIT replacement)
- Verification: `pnpm install` produces a tree with no `context-mode`
  package nodes (validates ELv2 truly gone)

This blueprint does NOT modify ingest-lens. It only files the issue
with the precise diff so the consumer team can land it after this BP
publishes.

**Files:**

- No agent-kit code changes
- Output: GitHub issue link captured in this blueprint dir as
  `ingest-lens-handoff.md`

**Acceptance:**

- [ ] Issue filed against ozby/ingest-lens with exact diff
- [ ] `ingest-lens-handoff.md` records issue URL + diff

#### [qa] Task 1.4: Verify ELv2 truly removed in a clean install

**Status:** todo

**Depends:** Task 1.1

In a fresh tmpdir, install agent-kit via `npm pack` + `npm install
<tarball>`. Run `npm ls --all` (or `pnpm why context-mode`) and assert
ZERO `context-mode` package nodes appear in the dep tree. This is the
ground-truth check that the wedge actually delivers — without it,
"opt-in" could still leak via a transitive dep we missed.

**Files:**

- Create: `scripts/verify-no-elv2.sh` (or equivalent test helper)

**Acceptance:**

- [ ] Clean install produces zero `context-mode` (and zero ELv2-tagged)
      packages in the tree
- [ ] Script can be re-run in CI as a regression guard

---

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `wp_typecheck` | Zero errors |
| Lint | `wp_lint` (scoped) | Zero violations |
| Tests | `wp_test` (scoped) | All pass |
| Audit | `wp_audit` (catalog-drift, docs-frontmatter) | All pass |
| Clean-install ELv2 check | `bash scripts/verify-no-elv2.sh` | Zero ELv2 nodes |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| Sibling (longer-horizon) | `replace-context-mode-plugin-with-v1-session-memory-mit-stack-...` (BP B) | This BP unblocks the urgent compliance path; sibling BP delivers full MIT replacement when ready |
| Downstream | ozby/ingest-lens (cross-repo) | Drops context-mode dep after this BP publishes |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| Consumer scripts assume `ctx_*` tools always available | Workflow breaks silently after upgrade | Migration note + clear changelog entry | 1.2 |
| context-mode appears as transitive dep of something else in agent-kit | "Opt-in" is fiction | Task 1.4 ground-truth `npm ls` check | 1.4 |
| Consumer has hardcoded `enabledPlugins.context-mode` in `.claude/settings.json` | Loud failure when context-mode not installed | Migration doc shows exact removal step | 1.2 |

## Non-goals

- Replacing `ctx_*` tools with MIT equivalents (tracked in sibling BP)
- Modifying ozby/ingest-lens (filed as handoff issue only)
- Bumping agent-kit major version — opt-in is additive for current
  consumers (they add one config line; nothing breaks)

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Consumer agents silently lose `ctx_*` tools after upgrade | Workflow regressions in the wild | Migration note prominent in README + changelog; opt-in is one line |
| Hidden transitive context-mode dep persists | "ELv2 gone" claim is false | Task 1.4 hard check |
| Removing default surface breaks `wp setup` recipes that assume context-mode | `wp setup --with monorepo-navigation` etc. | Audit at Task 1.1; preserve recipes that explicitly want context-mode by adding it to their explicit deps |

## Technology Choices

| Component | Technology | Version | Why |
| --- | --- | --- | --- |
| Opt-in mechanism | env var or config flag | n/a | Smallest surface; no dep changes required of consumers |
| Verification | `npm ls` / `pnpm why` | repo pinned | Ground truth on dep tree |
