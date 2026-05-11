# Changelog

## 0.12.1

### Patch Changes

- 5fdd688: `ak audit no-relative-parent-imports` now also skips `.stryker-tmp/`
  directories (mutation-testing sandboxes — gitignored, generated per
  package). Without this skip, the audit reports parent-path violations
  on tsconfigs Stryker materialises inside `<pkg>/.stryker-tmp/sandbox-*/`,
  which are throwaway copies that legitimately point back at sibling
  packages and would otherwise force every Stryker-using consumer to
  exclude paths manually.

## 0.12.0

### Minor Changes

- c193429: Extend `ak audit no-relative-parent-imports` to also scan every
  `tsconfig*.json` for parent-relative paths (`../`) in any string value:
  `extends`, `paths`, `references`, `include`, `exclude`, `rootDir`,
  `outDir`, `baseUrl`, etc. Use a package alias
  (`@scope/preset/tsconfig.json`) or a workspace path mapping instead.

  The walker skips `node_modules`, `dist`, `build`, `.git`, `.cache`,
  `.next`, `.turbo`, `.omx`, and `.claude` (per-worktree clones live there).

  Also fixes four stale `extends` paths inside agent-kit's own packages
  (`agent-e2e-preset`, `agent-launch`, `agent-test-preset`, `agent-vitest`):
  the T1.1 absorption renamed `packages/typescript-config/` →
  `packages/agent-tsconfig/`, but the `extends` strings still pointed at
  the pre-rename directory via `../typescript-config/`. They now resolve
  via the published alias `@webpresso/agent-tsconfig/<preset>.json`, which
  is both correct and survives future renames.

  Picked up automatically by `ak audit guardrails` and `ak audit quality`.

## 0.11.0

### Minor Changes

- 8e60dcf: Add `ak audit no-link-protocol` repo guardrail. Fails when any
  `package.json` (root or workspace member) declares a `link:<filesystem-path>`
  value in `dependencies`, `devDependencies`, `optionalDependencies`, or
  `pnpm.overrides`. `link:` filesystem-couples consumer clones to a
  maintainer's directory layout and hides version-pin drift — use `catalog:`
  (cross-repo) or `workspace:*` (intra-repo) instead.

  Automatically picked up by `ak audit guardrails` (pre-commit composite) and
  `ak audit quality` (full ship gate).

## 0.10.0

### Minor Changes

- 85b63d5: Add ./ai-memory and ./ai-prompts subpaths — memory primitives (checkpoint, facts, hierarchy) and prompt/debate primitives extracted from the Webpresso monorepo.
- 85b63d5: Add ./ai-tools subpath — file operation tools (read, write, search, list) for AI agents using a StorageAdapter interface, extracted from the Webpresso monorepo.
- ba84d37: Cross-runtime dev-link auto-restore + warning. Three new pieces:

  - **`ak-restore-dev-links` bin** — consumer postinstall helper. Reads
    `<consumer>/.webpresso/agent-kit-dev-link.json` (written by
    `pnpm dev:link --consumer …`) and re-creates the
    `node_modules/@webpresso/agent-kit` symlink that `pnpm install`
    silently overwrites with the pnpm-store snapshot. Exits 0 silently
    when the state file is absent (CI / never linked); exits 1 loudly
    when the state file points at a missing source (no silent
    fallback to stale code).

  - **`ak-check-dev-link` bin** — SessionStart hook. Emits the
    `{"hookSpecificOutput":{"hookEventName":"SessionStart",
"additionalContext":"…"}}` envelope shared by Claude Code
    (docs.claude.com/en/docs/claude-code/hooks) and Codex CLI
    (developers.openai.com/codex/hooks) when the symlink doesn't match
    the state file. Catches the rare `pnpm install --ignore-scripts`
    path where postinstall didn't fire. Always exits 0; never blocks.

  - **opencode plugin scaffolder** — `ak setup` now writes
    `.opencode/plugins/agent-kit-dev-link.js`, which shells out to
    `ak-check-dev-link` on `session.created` and pushes the same
    message into `output.context` during `experimental.session.compacting`.
    Single source of truth across all three runtimes.

  `ak setup` wires `ak-check-dev-link` into the SessionStart array of both
  `.claude/settings.json` and `.codex/hooks.json` automatically; existing
  hook entries are preserved (additive merge, dedup by bin name).

  Consumer migration: add `bun ./node_modules/.bin/ak-restore-dev-links`
  to your repo's `postinstall` script. Then run `ak setup` to wire the
  SessionStart hook + opencode plugin. State file is opt-in: `pnpm
dev:link --consumer <your-repo-root>` from this repo creates it.

## 0.9.0

### Minor Changes

- 562c419: Adds `@webpresso/agent-kit/quality-engine` subpath. The barrel re-exports every named symbol previously published from `@webpresso/quality-engine` (target-resolver, command-builder, log-paths, workspace-config, test-classification, package-import-rules). Folds the standalone `@webpresso/quality-engine` package per Decision 4 of the public-extraction roadmap. Hard cut — the standalone package is being deprecated and archived in coordination with this release. See `webpresso/blueprints/in-progress/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`.

## 0.8.6

### Patch Changes

- 0b29818: fix: doctor.test hardcoded local path and node_modules bin resolution

## 0.8.5

### Patch Changes

- da9ffeb: fix(mcp/run-command): prepend `{cwd}/node_modules/.bin` to PATH before spawning

  `runCommand` now mirrors npm/pnpm script execution: when a `cwd` is provided, it
  injects `{cwd}/node_modules/.bin` at the front of the child process PATH. This
  ensures project-local binaries (oxlint, tsc, etc.) resolve without a global
  install, matching the behaviour of `npm run` / `pnpm run`.

  Previously the MCP server inherited Claude Code's PATH, which does not include
  `node_modules/.bin`. Any tool missing from the global PATH (e.g. oxlint installed
  only locally) would ENOENT and fall through to the pnpm fallback, which in turn
  fails on repos using `just` rather than a root-level `pnpm lint` script.

## 0.8.4

### Patch Changes

- b504a77: Fix OpenCode agent-kit MCP wiring to launch the MCP entry directly, and make host verification fail when OpenCode lists an MCP server but cannot connect to it.
- 0f8620b: Keep the Claude marketplace manifest version in sync during Changesets versioning so published release metadata does not drift from `package.json`.

## 0.8.3

### Patch Changes

- 35f243d: Teach `ak hooks doctor` to verify installed Codex/OpenCode/Claude host surfaces, add a gated real-host smoke suite for Codex/OpenCode, and include `agent-kit` alongside `context-mode` in generated `opencode.json` MCP config.

## 0.8.2

### Patch Changes

- dfae682: Add a `context-mode` setup preset that patches Codex's `config.toml` and `hooks.json` plus project-local `opencode.json`, so `ak setup --with context-mode` wires context-mode for both Codex CLI and OpenCode.

## 0.8.1

### Patch Changes

- d230932: Keep consumer Claude scaffolds stable across reinstalls by linking rule/subagent files through `node_modules/@webpresso/agent-kit` aliases instead of resolved pnpm store paths, and materialize allowlisted `.claude/rules/*` overrides as real consumer-owned files instead of symlinks.

## 0.8.0

### Minor Changes

- ba66596: Eliminate the dangling-symlink class in `.agents/skills/` and harden `ak setup`
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

### Patch Changes

- 6fbe0dd: Migrate deprecated Codex `[features].codex_hooks` config entries to `[features].hooks` after `ak setup` runs the OMX preset, so older oh-my-codex releases do not keep triggering Codex deprecation warnings.

## 0.7.3

### Patch Changes

- f043257: Stop `ak setup --overwrite` from clobbering consumer-owned `.gitignore`
  and `pnpm-workspace.yaml`.

  Both files are now treated as **bootstrap-only** by the base-kit
  scaffolder: written from the catalog template only when absent, never
  overwritten once they exist (not even under `--overwrite`).

  These are consumer-owned config that grow with project-specific content
  the generic template can't reproduce — catalog entries referenced by
  `pnpm.overrides`, monorepo-specific ignore patterns for generated
  artifacts, etc. Re-templating them on every postinstall silently
  deletes that content.

  Verified failure mode (webpresso/monorepo, 2026-05-07):
  `ak setup --overwrite` running as 0.7.x postinstall reduced
  `pnpm-workspace.yaml` from 221 lines (full catalog) to 34 lines
  (generic template), removing every catalog entry referenced by
  `pnpm.overrides` and making the next `pnpm install` fail with
  `ERR_PNPM_CATALOG_IN_OVERRIDES`. The same overwrite stripped
  monorepo-specific `.gitignore` rules and unmasked 23k+ generated
  artifacts to git status.

  The other base-kit templates (`.husky/*`, `.editorconfig`,
  `.secretlintrc.json`, `commitlint.config.ts`,
  `.github/workflows/ci.webpresso.yml`) keep their existing
  `writeFileMerged` behavior — they're agent-kit-versioned configs where
  overwrite-on-update is the right semantic.

## 0.7.2

### Patch Changes

- 4e33177: Register `ak` as a published bin so consumers can run `ak setup`,
  `ak audit`, etc. directly from `node_modules/.bin/ak` (and
  `pnpm exec ak ...`) without the `bun ./node_modules/@webpresso/agent-kit/src/cli/cli.ts`
  workaround.

  The package shipped 6 hook bins (`ak-pretool-guard`, `ak-post-tool`,
  etc.) but never registered the main `ak` CLI entrypoint. Consumers
  hit this when `ak audit agents` demands `scripts.setup:agent === "ak setup"`
  literally, but `ak` itself wasn't on PATH — forcing every consumer to
  either fail the audit or carry a duplicate bun-driven `setup:agent-kit`
  script alongside the canonical `setup:agent`.

  `src/cli/cli.ts` already has the `#!/usr/bin/env bun` shebang, so the
  fix is one entry: `"ak": "./src/cli/cli.ts"` in the bin map.

## 0.7.1

### Patch Changes

- 04111a1: Fix `ak audit agents` reading `.codex/hooks.json` as flat-form when the
  canonical Codex schema is wrapped under `"hooks"`.

  `parseHooks` returned `parsed.hooks` for `claude` but raw `parsed` for
  `codex`. The agent-hooks scaffolder writes wrapped form via
  `hoistTopLevelEvents` (matching `https://developers.openai.com/codex/hooks`),
  so every consumer with a freshly-scaffolded `.codex/hooks.json` saw the
  audit report all 5 ak-\* hooks as missing — even though they were present.
  This false-positive blocked commits via the `audit agents` pre-commit
  gate on consumers like `webpresso/monorepo`.

  Now Codex audit reads `parsed.hooks` first (wrapped) and falls back to
  `parsed` only when no `hooks` wrapper is present, preserving backwards-compat
  with legacy pre-migration flat-form files.

  Existing `seedConsumerRepo` test fixture updated to write the wrapped form
  (matching what the scaffolder actually emits today). The self-hosting test
  keeps the flat-form fixture to lock the backwards-compat path.

## 0.7.0

### Minor Changes

- 2db1b01: Add optional `cwd` param to all MCP dev-workflow tools: `ak_test`, `ak_lint`,
  `ak_typecheck`, `ak_qa`, `ak_e2e`, `ak_audit`.

  The MCP server inherits the cwd of the Claude Code session that spawned it.
  When a session was opened in one repo and called an `ak_*` tool against a
  sibling repo, the backend ran against the session's cwd and failed (e.g.
  `pnpm test` in a yarn-configured tree returned "This project is configured
  to use yarn"; `tsc --noEmit` with no tsconfig at cwd dumped `--help`).

  `cwd` is a walk-start: the resolver still walks up to find the workspace
  root (pnpm-workspace.yaml / package.json / Justfile), so callers can pass
  any subdir of the target repo and get correct backend selection. `ak_qa`
  forwards `cwd` to all three sub-tools so a composite QA run from the wrong
  session cwd works in one call. `ak_audit` accepts `cwd` as an alias for the
  existing `directory` param.

  Backwards-compatible: omitting `cwd` preserves prior behavior
  (`process.cwd()`).

### Patch Changes

- 2db1b01: Fix the rtk scaffolder so `ak setup` actually installs rtk.

  The previous scaffolder shipped two unverified guesses:

  1. `brew install rtk-ai/rtk/rtk` via `tap "rtk-ai/rtk"` — that tap does not
     exist (`https://github.com/rtk-ai/homebrew-rtk` returns 404), so every
     `ak setup` on macOS hit `rtk-not-found` and silently degraded. The real
     formula is in homebrew-core: `brew install rtk` (verified against
     `Formula/r/rtk.rb` v0.39.0). Brewfile entries in consumer repos that
     followed the same wrong path also failed `brew bundle install`.
  2. `RTK_HOOK_EXCLUDE_COMMANDS` env var passed to `rtk init` — rtk does not
     read this env var (verified against the rtk binary's strings table). The
     env var was a no-op. Real exclusion needs the proper rtk mechanism (TOML
     filters or hook matcher) and is left as a follow-up.

  Also fixes an integration-test PATH leak that masked the bug on machines
  where rtk was not installed locally.

## 0.6.0

### Minor Changes

- 1e7ec89: Plugin manifest: PreToolUse now matches Bash + MultiEdit

  The Claude Code plugin install path previously left Bash unguarded —
  the SessionStart routing block was advisory but not enforced. Adding
  `Bash|MultiEdit` to the PreToolUse matcher (full matcher now
  `Bash|Edit|Write|MultiEdit|WebFetch|Read|Grep`) lets the
  `forbidden-commands` validator actually intercept `pnpm vitest`,
  `just test`, `oxlint`, `tsc`, and other dev-workflow shell commands and
  redirect them to the corresponding `ak_*` MCP tools.

  Matches context-mode's own plugin precedent (their `hooks/hooks.json`
  registers PreToolUse for Bash, WebFetch, Read, Grep, Agent, and
  `mcp__*` matchers).

  The npm + `ak setup` install path and the Codex hook scaffolder were
  already correct; this change closes the gap on the plugin install path.

### Patch Changes

- c47b64a: Fix `base-kit` templates: invoke `ak` via `pnpm exec` instead of `npx`.

  `ak setup --with base-kit` installs `.husky/pre-commit`, `.husky/commit-msg`,
  and `.github/workflows/ci.webpresso.yml` from `catalog/base-kit/`. Previously
  all three shelled out via `npx ak ...`, which routes through npm. In any
  pnpm-only repo (i.e. all webpresso consumers), npm's arborist parses the
  workspace and rejects pnpm-specific protocols like `catalog:` with
  `EOVERRIDE`. The hook then exits 1 and every `git commit` that touches
  `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` fails — even
  though `pnpm install --frozen-lockfile` itself accepts the same workspace
  cleanly.

  Switching to `pnpm exec` keeps everything in pnpm's resolution path. The
  binary still resolves through `node_modules/.bin/ak`, but no npm process
  is spawned and no workspace re-parse happens.

  Files updated:

  - `catalog/base-kit/.husky/pre-commit.tmpl`
  - `catalog/base-kit/.husky/commit-msg.tmpl`
  - `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`

  Consumers that already installed prior templates: re-run `ak setup
--overwrite --with base-kit`, or hand-edit the three files; the diff is
  literally `s/npx/pnpm exec/`.

## 0.5.1

### Patch Changes

- b7fa591: Fix `ak_blueprint` MCP tool: flatten `inputSchema` so it serializes with root-level `type: "object"`.

  The MCP spec (`ToolSchema` in `@modelcontextprotocol/sdk`) requires every tool's `inputSchema.type` to be exactly `"object"`. `ak_blueprint` previously declared its input schema as a Zod `discriminatedUnion`, which serializes to JSON Schema as `{ oneOf: [...] }` with no top-level `type`. Strict MCP clients (e.g. Codex) rejected the entire `tools/list` response with:

  ```
  "path": ["tools", N, "inputSchema", "type"], "message": "expected 'object'"
  ```

  That broke ALL agent-kit MCP tools for the offending client, not just `ak_blueprint`.

  The fix flattens the schema to a single `z.object({ action, ...optional fields })` and enforces the per-action invariants (`goal` required when `action === 'new'`) via `superRefine`. JSON-schema clients now see one valid object shape; runtime dispatch is unchanged.

  All 8 MCP tools (`ak_lint`, `ak_qa`, `ak_e2e`, `ak_test`, `ak_format`, `ak_blueprint`, `ak_typecheck`, `ak_audit`) now serialize with spec-compliant root shape.

## 0.5.0

### Minor Changes

- 25c065c: Codex hooks scaffolder + gstack opt-out

  **Codex hooks schema fix.** `ak setup` now writes `.codex/hooks.json` under the
  canonical wrapped `hooks` key (`{ "hooks": { "SessionStart": [...] } }`) per
  Codex's official schema at `developers.openai.com/codex/hooks`. Previous
  versions wrote event keys at the top level, which Codex silently ignored —
  agent-kit hooks were never actually firing in any Codex session. Stale
  flat-form entries are migrated automatically: the next `ak setup` hoists any
  top-level `SessionStart`/`PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`Stop`
  keys into the wrapped `hooks` block, deduping with `ensureGroup`.

  **DRY refactor.** The 5-event ak-_ hook list now lives in a single
  `buildAgentKitHookGroups({ resolveBin, matchers })` helper consumed by both
  `patchClaudeSettings` and `patchCodexHooks`. Adding a new ak-_ hook is a
  one-line append and propagates to both surfaces.

  **Gstack opt-out.** `AK_SKIP_GSTACK=1 ak setup` now skips the gstack
  scaffolder with a stderr warning. `gstack` remains in `DEFAULT_PRESETS` so
  `ak setup` (no flags) still installs and refreshes gstack on every run; the
  new env-var is for CI / sandboxed environments without network. Most
  consumer repos treat gstack as a hard prerequisite — opt out only when you
  must.

  **MCP readiness sentinel — decoupled scan-based reader.** The pretool-guard
  hook routes dev-workflow commands (`pnpm test`, `just lint`, `ak ...`) to
  the agent-kit MCP tool surface when MCP is alive, falling back to a
  `just <task>` recipe otherwise. Earlier the readiness sentinel filename was
  derived from a value (`process.ppid`, then briefly a project-anchor hash)
  that BOTH writer and reader had to agree on. Both approaches break under
  real IDE topologies: PPID assumes the IDE host is the direct parent of
  both processes (Codex CLI routes hooks through workers), and cwd-derived
  keys assume the IDE spawns the MCP server with the project root as cwd
  (Codex spawns it with the script's directory).

  The fix decouples the two halves. The writer claims a unique filename
  (`ak-mcp-ready-${process.pid}` by default, overridable via
  `AK_MCP_SENTINEL_KEY` for tests). The reader scans `tmpdir` for ALL
  `ak-mcp-ready-*` files and returns true if any contains a live PID
  (verified via `process.kill(pid, 0)`). Reader and writer no longer need
  to agree on a key — only on a stable filename pattern. The agent-kit MCP
  tool surface is functionally global, so "any agent-kit MCP is alive" is
  sufficient signal to enable MCP-tool routing on the hook side.

### Patch Changes

- 25c065c: `ak setup` now upserts `[mcp_servers.agent-kit]` into Codex's `config.toml`.

  The codex-mcp scaffolder previously only managed the Playwright MCP block; users who wanted agent-kit's MCP server reachable from Codex had to hand-edit `~/.codex/config.toml`. The Claude Code side was always self-registered via the plugin manifest, so this gap was Codex-only.

  The new `ensureCodexAgentKitMcp` helper probes for an agent-kit install at scaffold time:

  1. Claude plugin install (`~/.claude/plugins/cache/agent-kit/agent-kit/`)
  2. bun global (`~/.bun/install/global/node_modules/@webpresso/agent-kit/`)
  3. pnpm global (`$(pnpm root -g)/@webpresso/agent-kit/`)
  4. npm global (`$(npm root -g)/@webpresso/agent-kit/`)

  Whichever exists first becomes the absolute path written into the codex config block. If none are found, the scaffolder logs a clear warning telling the user to install agent-kit globally — no broken config is written.

  Migration note: when the unified-cli sibling cutover lands and `webpresso mcp serve` becomes the canonical entrypoint, this scaffolder collapses to writing a fixed `command = "webpresso", args = ["mcp", "serve"]` block — the install-detection probe goes away.

  New exports from `@webpresso/agent-kit`'s codex-mcp scaffolder for downstream consumers:

  - `ensureCodexAgentKitMcp({ options, configPath?, entryPath?, probe? })`
  - `findAgentKitMcpEntry({ candidates?, pnpmGlobalRoot?, npmGlobalRoot? })`
  - `agentKitMcpBlock(entryPath)`, `upsertAgentKitMcpServer(raw, entryPath)`
  - `AGENT_KIT_MCP_SERVER_NAME`, `AGENT_KIT_MCP_HEADER`

## 0.4.0

### Minor Changes

- 12f38d2: Consumer-rule + consumer-skill primitives, unified `ak sync` command, and removal of legacy sync commands.

  **New primitives**

  - `ak lint [--fix] [--no-pnpm-fallback]` — wraps `oxlint` (with `pnpm lint` fallback) and prints structured issues. Mirrors the `ak_lint` MCP tool. Exit code matches lint result.
  - `ak format [--check]` — wraps `oxfmt` to format the workspace in place; `--check` exits 1 on any unformatted file (CI / pre-commit friendly). No fallback — `oxfmt` must be installed.
  - `ak_format` MCP tool — same shape as `ak_lint`, returns the standard summary-first payload, sets `isError: true` when `oxfmt` is missing on PATH.
  - `@webpresso/agent-kit/format` subpath export — `runFormat({ cwd, files?, check?, signal? })` for programmatic use by scaffolders / CI orchestrators.
  - agent-kit dogfoods both: `pnpm qa` now runs `pnpm lint` + `pnpm format:check` between typecheck and test; `.husky/pre-commit` calls `ak format --check` then `ak lint`; CI's `check` job runs `pnpm run format:check` + `pnpm run lint` (replacing the silent `pnpm -r run lint 2>/dev/null || true`).
  - `ak rule new|list|show|deprecate <slug>` — consumer-owned rules at `<repo>/agent-rules/<slug>.md`. Slug-only filenames; frontmatter validated by Zod (`type`, `slug`, `title`, `status`, `scope`, `applies_to`, `related`, `created`, `last_reviewed`, optional `deprecation_date`).
  - `ak skill new|list|show|deprecate <slug>` — consumer-owned skills at `<repo>/agent-skills/<slug>/SKILL.md` (dirs bundle SKILL.md + arbitrary assets).
  - `ak audit rules` and `ak audit skills` — schema validation, slug-collision detection (consumer + catalog hard-fail), broken-`related` ref detection, stale-review warnings (>180 days). Wired into `REPO_AUDIT_REGISTRY`.
  - Shared `src/content/{schema,loader,audit,dispatch}.ts` module — single source of truth for both kinds; per-kind difference is parameterized (file vs dir).

  **Unified sync replaces copy-on-install**

  - New `ak sync [--kind rules|skills] [--check]` command. `--check` exits 1 on drift (CI-friendly); regular run prints "restart your IDE" when files were written.
  - Per-IDE distribution: symlink for `.agent/{rules,skills}/`, `.codex/agents/`, `.claude/skills/`; copy for `.cursor/rules/`, `.windsurf/skills/`; TOML transform for `.gemini/commands/`.
  - `ak setup` no longer copies catalog rules/skills into `.agent/` — instead invokes `ak sync` post-scaffold. Result: zero `.new` sidecars on `pnpm install`, fully idempotent re-runs, no drift surface.
  - pnpm `.pnpm/<version>/` instability absorbed via `realpathSync` on catalog dir.

  **Breaking changes (pre-1.0 minor)**

  - `ak symlink sync` removed. Use `ak sync`.
  - `ak cursor-windsurf-sync` removed. Use `ak sync`.
  - `ak skills` (plural) renamed to `ak skill` (singular) — matches `ak blueprint` / `ak tech-debt` convention. The `install`/`uninstall` actions survive but with new semantics: registry-only edit to `.agent-kitrc.json#installed.tier3Skills` (no copy). Running `ak skills` now errors with a redirect message.
  - `ak setup --overwrite` no longer touches `.agent/rules/` or `.agent/skills/` — they are derived from sync. Existing `--overwrite` semantics for `AGENTS.md`, `.claude/settings.json`, `.codex/hooks.json`, `docs/templates/` are unchanged.

  **Catalog promotions**

  - Three universal rules promoted into `catalog/agent/rules/`: `no-timeout-as-fix.md`, `pre-implementation.md`, `ts-coding-conventions.md`.

  **Migration notes for consumers**

  - After upgrading, run `pnpm install` once. `agent-rules/` and `agent-skills/` are scaffolded with `.gitkeep` + README. Add repo-specific rules via `ak rule new <slug>` rather than editing canonical files.
  - Slug collisions between consumer rules/skills and catalog content are hard audit failures — pick a different slug or upstream the change.
  - Add `ak audit rules` and `ak audit skills` to your CI checklist.

## 0.3.0

### Minor Changes

- Finish the elegance-pass bootstrap work so fresh repos get the right agent
  surfaces and routing by default. This release adds hard-fail agent audits,
  scoped skill hooks, canonical subagent distribution, and MCP-shaped forbidden
  command redirects with cleaner routing ownership.

All notable changes to `@webpresso/agent-kit` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

## [0.2.0] — 2026-05-02

### Added

- `@webpresso/agent-kit/lint` subpath export: `runLint(options): Promise<LintResult>` plus `parseOxlintIssues` helper for framework-level lint orchestration without the MCP transport.
- `@webpresso/agent-kit/typecheck` subpath export: `runTypecheck(options): Promise<TypecheckResult>` plus `parseTscOutput` helper for framework-level typecheck orchestration without the MCP transport.

## [0.1.0] — 2026-04-25

### Added

- Blueprint runtime: `ak blueprint new/list/show/audit/exec/move/finalize/start/task`
- Agent-surface symlinker: `ak symlink sync/check/import`
- Skills catalog with 13 bundled skills
- `ak setup` scaffolder: Tier-1/2/3 skill tiers, presets (omx, gstack, lore-commits)
- Claude Code plugin (`.claude-plugin/`) with PreToolUse, PostToolUse, Stop, SessionStart hooks
- Coordinated PreToolUse hook: dev-command routing + sandbox routing + validators in one process
- SessionStart routing block (AK_ROUTING_BLOCK XML) injected at session start and after compaction
- `ak audit` suite: tph, bundle-budget, catalog-drift, docs-frontmatter, blueprint-lifecycle,
  no-relative-parent-imports, mutation, quality composite gate
- `ak hooks doctor` for post-install plugin health verification
- `ak tech-debt` lifecycle management (new, list, review)
- `ak symlink import --from <file>` for onboarding existing IDE rule files
- MCP server with 6 tools: ak_test, ak_lint, ak_typecheck, ak_qa, ak_audit, ak_blueprint
- `resolvePackageAsset()` utility replacing fixed-depth relative path traversals
- `auditNoRelativeParentImports` guardrail for 3+ level runtime path traversals
