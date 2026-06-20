---
type: blueprint
title: "wp setup output must pass wp audit guardrails (self-consistency)"
owner: ozby
status: planned
complexity: L
created: '2026-06-13'
last_updated: '2026-06-17'
progress: '20% (legacy helper-script removal in progress; setup-action helper centralization and local hook hardening started)'
depends_on: []
cross_repo_depends_on: []
tags:
  - scaffolder
  - audit
  - guardrails
  - hooks
  - regression
  - dx
---

# wp setup output must pass wp audit guardrails (self-consistency)

**Goal:** Make `wp setup` and `wp audit guardrails` mutually consistent. Today a
consumer cannot run both in CI — the scaffolders generate artifacts that fail
audits shipped by the same package, and the host hook configs the `agents` audit
requires are gitignored so they are absent on a clean CI checkout. Fix the
generators, commit the hook contract as a deterministic generated artifact, and
add a regression gate so the recurrence class is closed at the source.

## Product wedge anchor

- **Stage outcome:** Reference-consumer toolchain parity — the three reference
  consumers (`ozby/ingest-lens`, `ozby/edge-matte`, `ozby/ozby-dev`) must be able
  to dogfood the full agent-kit governance surface. Ties to the
  `reference-parity-regression-and-host-smoke-gate` planned blueprint (this is a
  concrete regression gate under that umbrella).
- **Consuming surface:** the consumer CI `check` job that runs `pnpm install`
  then `wp audit guardrails` (`catalog/base-kit/.github/workflows/ci.yml.tmpl`).
- **New user-visible capability:** a third-party consumer can run `wp audit
  guardrails` in CI on a clean checkout — with no `wp setup` materialization step
  — and have it pass, which is impossible today.

## Background / Incident

`ozby/ozby-dev` (PR #5) could not get CI green. `wp audit guardrails` runs ~38
audits in CI; three fail in the `wp setup`-in-CI configuration:

- `secret-provider-quarantine` — the generated `scripts/audit-secret-provider-quarantine.ts`
  contains literal banned patterns (D1).
- `skills` — the generated `agent-skills/monorepo-navigation/SKILL.md` has stale
  frontmatter missing required schema fields (D2).
- `agents` — fails on a **clean checkout** because the committed-config check
  `checkHookFile` requires `.claude/settings.json` and `.codex/hooks.json`, but
  those files are **gitignored**, so they are absent after `git clone` (D3).

**Root-cause correction (eng-review):** D3 is NOT `hook-vendor-drift`. That audit
only emits `severity: 'warning'` for absent runtime `.sh` files
(`src/audit/hook-vendor-drift.ts:61-62`, comment "absent (fine)"). The hard
failure is `src/audit/agents.ts` `checkHookFile`:

```ts
if (!existsSync(filePath)) {
  violations.push({ message: 'Missing .claude/settings.json — run `wp setup`...' })
}
```

The host hook **config** files (`.claude/settings.json`, `.codex/hooks.json`) are
the hook-wiring contract — and they are gitignored, so a clean checkout has
nothing for `checkHookFile` to read.

ozby-dev shipped a **consumer-side interim workaround** (CI runs
`wp setup --restore-hooks` to regenerate the config + hooks; a contract test
`src/ci-governance-contract.test.ts` pins it). This blueprint fixes the defects
at the agent-kit source so no consumer needs that workaround.

**Additional recurrence discovered during closeout (2026-06-17):**
generated setup actions still rely on brittle inline version-resolution shell
logic. `ingest-lens` proved this can fail in CI before any test logic starts.
That bootstrap logic must move into a deterministic scaffold-owned helper so the
regression is caught at the generator boundary, not patched per consumer.

## Architecture Overview — Option D (committed deterministic hook contract)

Industry convention (Husky/Lefthook/pre-commit all **commit** their hook config)
plus the generate→commit→CI-drift-gate pattern (protobuf, `go generate`, sqlc,
anthropics/connect-rust #95). The host config files ARE the contract; make them
deterministic and commit them.

```text
WP_HOOK_SPECS (IR, agent-hooks/ir.ts)   single source of truth
        │  per-host emitters (claude/codex/cursor/opencode) — DETERMINISTIC
        ▼
  .claude/settings.json   .codex/hooks.json     ← COMMITTED (un-gitignored),
        │  (managed-region markers, no absolute paths, no timestamps)
        ├─► agents.checkHookFile passes on clean checkout (files present)
        └─► CI drift gate: re-emit in memory, diff MANAGED region vs committed → fail on drift

  .claude/hooks/managed/*.sh (bodies) + .webpresso/hooks-manifest.json
        → stay gitignored = machine-local runtime, validated by `wp hooks doctor`
```

Why not the alternatives: a separate `WP_HOOK_SPECS`-derived "contract" artifact
(Codex's Option C) is unnecessary scope — the host config files are already the
right artifact. Fail-opening `checkHookFile` would weaken the audit for real
consumers. Committing the deterministic config is the boring, battle-tested
choice.

## Fact-Check Findings

| ID | Severity | Claim / Assumption | Verified Reality (file:line) | Fix |
| -- | -------- | ------------------ | ---------------------------- | --- |
| F1 | CRITICAL | Generated quarantine helper trips the quarantine audit. | `scaffold-base-kit.ts:56-72` TEMPLATE_MAP copies `scripts/audit-secret-provider-quarantine.ts.tmpl`; that tmpl uses literal `/\bdoppler run\b/`; `secret-provider-quarantine.ts:7-17` walks `scripts/` (not in IGNORED_DIRS) and splits its own regexes via `p([...])` to avoid self-trigger. | T1.1, T1.2, T1.3 |
| F2 | HIGH | Removing legacy scripts from generation is a complete fix. | False. `scaffold-base-kit.ts:150` preserves existing package.json script keys; `audit-hooks/index.ts:27` appends pre-commit lines only. Existing consumers keep failing. | T1.3 (migration) |
| F3 | HIGH | Generated SKILL.md passes the skills schema. | `SKILL.md.tpl` emits only `name`+`description`; `content/schema.ts` baseShape requires `type:'skill', slug, title, applies_to[], created(ISO), last_reviewed(ISO)`. | T2.1, T2.2 |
| F4 | CRITICAL | (eng-review) The `agents` failure is `hook-vendor-drift` / absent `.sh` files. | False. `hook-vendor-drift.ts:61-62` is `severity:'warning'`. The hard fail is `agents.ts` `checkHookFile`: `if (!existsSync(filePath)) violations.push('Missing .claude/settings.json')`. The committed configs `.claude/settings.json` / `.codex/hooks.json` are gitignored → absent on clean checkout. | T3.1, T3.2, T3.3 |
| F5 | CRITICAL | Codex `.codex/hooks.json` launcher is path-neutral. | False today (fixable). `agent-hooks/index.ts:83` `codexManagedHookLauncherPath` uses `resolve(repoRoot, CODEX_MANAGED_HOOK_SUBDIR, ...)` → absolute, non-committable. Codex needs cwd-stability (no `$CLAUDE_PROJECT_DIR`), but Codex's own docs anchor hook commands with `$(git rev-parse --show-toplevel)` — portable + cwd-stable + machine-independent. Use that. | T3.1 |
| F6 | HIGH | The meta-regression test (full setup → guardrails) is sufficient. | Insufficient. Without a valid `.webpresso/secrets.config.json`, both `no-dev-vars` and `secret-provider-quarantine` skip entirely (`secret-provider-quarantine.ts:79`). Needs a clean-checkout fixture and a migration fixture. | T4.1, T4.2, T4.3 |
| F7 | MEDIUM | Render-time dates are safe. | `created`/`last_reviewed` re-stamped on every `wp setup` cause drift (reproducible-builds: no embedded timestamps in committed output). Generation must preserve existing dates. | T2.1 |
| F8 | MEDIUM | agent-kit itself has no dependents on the legacy scripts. | `package.json:569-570` (`verify:secrets`, `audit:secret-provider-quarantine`) and `scripts/public-readiness.ts:155` invoke them. | T1.4 |
| F9 | MEDIUM | Committing the host configs is gitignore-safe. | `gitignore-patcher.ts:55` ignores generated paths and cleanup untracks them; `.gitignore:102` ignores `.claude/settings.json`. Un-ignoring + a managed-region drift gate is required so consumer-added hooks are preserved. | T3.2, T3.3 |
| F10 | MEDIUM | (eng-review) T1.3 migration is safe to clobber generated values. | Risk: a consumer may have hand-edited the script value. Migration must match webpresso-owned exact values only and leave divergent content untouched, with a test for the hand-edited case. | T1.3, T4.3 |
| F11 | LOW | (eng-review) T4.2 clean-checkout reproduces D3 by deleting `.sh` files. | It must delete the committed `.claude/settings.json` / `.codex/hooks.json` from the fixture's working set too — `checkHookFile` reads those, not the `.sh` bodies — or it won't reproduce the real failure. (Post-Option-D, the committed files are present, so the fixture instead asserts they exist + drift gate passes.) | T4.2 |
| F12 | HIGH | Scaffolded setup actions can safely keep inline version-resolution shell logic. | False. `catalog/base-kit/.github/actions/setup-webpresso/action.yml.tmpl` currently shells inline version-resolution logic, while `ingest-lens` already needed a dedicated `scripts/resolve-webpresso-cli-versions.cjs` helper after CI parsing failed before tests started. The helper belongs in scaffold output so consumers share one deterministic bootstrap path. | T1.5, T4.4 |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| D3 architecture | **Option D** — commit the host hook configs (`.claude/settings.json`, `.codex/hooks.json`) as deterministic generated artifacts from `WP_HOOK_SPECS`; un-gitignore them; CI drift gate diffs the managed region; runtime `.sh` + manifest stay local for `wp hooks doctor` | Web research: every hook framework (Husky/Lefthook/pre-commit) commits hook config; generate→commit→drift-gate is the standard for checked-in generated code (protobuf/go-generate/connect-rust). The host files are already the contract — no separate artifact (Codex Option C) needed; no audit-weakening fail-open. |
| Rejected (Codex Option C) | Separate `WP_HOOK_SPECS`-derived contract validated by hook-vendor-drift | hook-vendor-drift is not the failing check (F4); a new artifact is accidental complexity. |
| Rejected (fail-open) | `checkHookFile` passes when config absent | Weakens the audit's ability to catch "you forgot to wire hooks" for real consumers. |
| Determinism prerequisite | Codex emitter emits a portable launcher (no `resolve()` absolute path); SKILL.md preserves existing dates | Committed generated output must be reproducible (F5, F7). |
| Scope | One blueprint covering D1+D2+D3 | User decision 2026-06-13: single publish + catalog bump fixes everything and retires the ozby-dev interim sooner. |
| ozby-dev interim | Keep `wp setup --restore-hooks` CI step + `ci-governance-contract.test.ts` until this ships | No consumer regression during the change + publish cycle. |
| Legacy scripts | Stop generating; migrate existing consumers to `wp audit no-dev-vars` / `wp audit secret-provider-quarantine`; remove stale generated files | Already superseded (completed blueprint `centralize-consumer-governance-scripts-as-wp-audit-subcommands`). |
| Setup bootstrap helper | Generate a repo-local helper for catalog-aware `@webpresso/agent-kit` / `vite-plus` resolution and call it from scaffolded setup actions | Prevents per-consumer shell drift and lets local hooks/tests catch bootstrap regressions before consumer CI. |
| Recurrence gate | Meta integration test: `wp setup` → full `guardrails` == 0 failures, across fresh / clean-checkout / migration fixtures, each with a valid `.webpresso/secrets.config.json` | Converts CI-only discovery into a pre-publish unit test (F6). |

## Tasks

#### [scaffold] Task 1.1: Stop generating legacy quarantine/dev-vars scripts

**Status:** todo

**Depends:** None

Remove the two legacy script templates from base-kit generation and switch the
generated package.json script *values* to the `wp audit` CLI forms. Fresh
generation only — existing consumer files are T1.3.

**Files:**
- Modify: `src/cli/commands/init/scaffold-base-kit.ts` (TEMPLATE_MAP entries; `verifySecretsScript` / `secretQuarantineAuditScript` values ~lines 165-166)
- Modify: `src/cli/commands/init/scaffold-base-kit.test.ts`
- Delete: `catalog/base-kit/scripts/check-no-dev-vars.ts.tmpl`, `catalog/base-kit/scripts/audit-secret-provider-quarantine.ts.tmpl`

**Steps (TDD):**
1. Failing test: fresh scaffold creates no `scripts/audit-secret-provider-quarantine.ts`; generated `verify:secrets` = `wp audit no-dev-vars`, `audit:secret-provider-quarantine` = `wp audit secret-provider-quarantine`.
2. `./bin/wp test --file src/cli/commands/init/scaffold-base-kit.test.ts` — FAIL.
3. Implement.
4. Re-run — PASS. `./bin/wp lint --file src/cli/commands/init/scaffold-base-kit.ts` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] Fresh scaffold emits no legacy `scripts/*.ts`
- [ ] Generated package.json scripts use `wp audit` CLI forms
- [ ] lint + typecheck pass

#### [scaffold] Task 1.2: Switch audit-hooks pre-commit lines to CLI forms

**Status:** todo

**Depends:** None

Replace the `bun scripts/...` entries in `AUDIT_HOOK_LINES` with `wp audit` CLI
forms, and update `hasEquivalentLine` matching.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/audit-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/audit-hooks/index.test.ts`

**Steps (TDD):**
1. Failing test: fresh `.husky/pre-commit` writes `wp audit no-dev-vars` + `wp audit secret-provider-quarantine`, not `bun scripts/...`.
2. `./bin/wp test --file src/cli/commands/init/scaffolders/audit-hooks/index.test.ts` — FAIL.
3. Implement.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Fresh pre-commit uses CLI forms
- [ ] Idempotent re-run produces no change

#### [scaffold] Task 1.3: Migrate existing consumers (exact-value replace + stale cleanup)

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Reconcile webpresso-owned generated values during `wp setup`: replace the legacy
`package.json` script values (exact match `bun scripts/check-no-dev-vars.ts`,
`bun scripts/audit-secret-provider-quarantine.ts`) with CLI forms, replace the
legacy `.husky/pre-commit` lines, and remove the stale generated scripts. Gate so
divergent (consumer-edited) content is never clobbered (F10).

**Files:**
- Modify: `src/cli/commands/init/scaffold-base-kit.ts` (reconcile-owned-content path near `:150`)
- Modify: `src/cli/commands/init/scaffolders/audit-hooks/index.ts`
- Create: `src/cli/commands/init/scaffolders/audit-hooks/migrate-legacy.test.ts`

**Steps (TDD):**
1. Failing test (two cases): (a) seed old generated values + stale scripts → setup rewrites to CLI forms, replaces pre-commit lines, removes stale scripts; (b) seed a consumer-edited value → setup leaves it untouched.
2. `./bin/wp test --file src/cli/commands/init/scaffolders/audit-hooks/migrate-legacy.test.ts` — FAIL.
3. Implement reconciliation.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Old generated values rewritten to CLI forms; stale scripts removed
- [ ] Consumer-edited (divergent) content untouched

#### [self] Task 1.4: Repoint agent-kit's own legacy script references

**Status:** todo

**Depends:** Task 1.1

Keep agent-kit building: update its own `package.json` scripts and
`public-readiness` caller to the CLI forms (or remove if dead).

**Files:**
- Modify: `package.json` (`:569-570`)
- Modify: `scripts/public-readiness.ts` (`:155`)

**Steps (TDD):**
1. Failing assertion/test: no agent-kit source references `bun scripts/audit-secret-provider-quarantine.ts`; `public-readiness` runs clean.
2. Run — FAIL.
3. Repoint references.
4. Re-run — PASS. `./bin/wp typecheck`.

**Acceptance:**
- [ ] No agent-kit source invokes the legacy bun scripts
- [ ] `public-readiness` passes

#### [scaffold] Task 1.5: Generate a deterministic setup-action version helper

**Status:** todo

**Depends:** None

Add a scaffold-owned helper template (for example
`scripts/resolve-webpresso-cli-versions.cjs`) that resolves
`@webpresso/agent-kit` and `vite-plus` from consumer-owned dependency metadata,
including catalog-aware pins, and update the scaffolded `setup-webpresso`
action to call it instead of inline shell parsing.

**Files:**
- Create: `catalog/base-kit/scripts/resolve-webpresso-cli-versions.cjs.tmpl`
- Create: `catalog/base-kit/.husky/pre-push.tmpl`
- Modify: `catalog/base-kit/.github/actions/setup-webpresso/action.yml.tmpl`
- Modify: `catalog/base-kit/.husky/commit-msg.tmpl`
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/cli/commands/init/scaffold-base-kit.test.ts`
- Modify: `src/cli/commands/init/init.e2e.test.ts`

**Steps (TDD):**
1. Failing test: fresh scaffold emits the helper file + `.husky/pre-push`, and
   the generated `setup-webpresso` action references the helper.
2. `./bin/wp test --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/init.e2e.test.ts` — FAIL.
3. Implement helper + template wiring.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Fresh scaffold emits the helper file and `.husky/pre-push`
- [ ] Generated `setup-webpresso` action calls the helper
- [ ] Generated `commit-msg` hook requires Lore trailers

#### [skill] Task 2.1: SKILL.md.tpl full frontmatter + deterministic date render

**Status:** todo

**Depends:** None

Emit the full required skill frontmatter (`type`, `slug`, `title`, `applies_to`,
`created`, `last_reviewed`) from `SKILL.md.tpl`, rendered in
`scaffold-monorepo-nav.ts`. Dates must be preserved when the target file exists
(parse existing frontmatter); stamp only on first creation (F7 — determinism).

**Files:**
- Modify: `catalog/agent/skills/monorepo-navigation/SKILL.md.tpl`
- Modify: `src/cli/commands/init/scaffold-monorepo-nav.ts`
- Modify: `src/cli/commands/init/scaffold-monorepo-nav.test.ts`

**Steps (TDD):**
1. Failing test: fresh render validates against `skillFrontmatterSchema`; re-render of an existing file preserves its `created`/`last_reviewed`.
2. `./bin/wp test --file src/cli/commands/init/scaffold-monorepo-nav.test.ts` — FAIL.
3. Implement template + date-preserving render.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Rendered SKILL.md validates against `skillFrontmatterSchema`
- [ ] Existing dates preserved on re-render

#### [test] Task 2.2: Single-source schema validation + multi-run idempotency

**Status:** todo

**Depends:** Task 2.1

Prevent template/schema drift and prove date idempotency: validate the rendered
skill against the exact `content/schema.ts` schema (not a copied field list), and
assert two consecutive renders produce byte-identical frontmatter.

**Files:**
- Modify: `src/cli/commands/init/scaffold-monorepo-nav.test.ts` (import `skillFrontmatterSchema` from `#content/schema`)

**Steps (TDD):**
1. Add: render → `skillFrontmatterSchema.safeParse(...)` succeeds; removing any required template field fails the test.
2. Add: render twice → identical `created`/`last_reviewed`.
3. Run — PASS on T2.1 output. lint + typecheck.

**Acceptance:**
- [ ] Test imports the real schema (no duplicated field list)
- [ ] Two renders are byte-identical (idempotent dates)

#### [emit] Task 3.1: Make Codex hook-config emitter deterministic + path-neutral

**Status:** todo

**Depends:** None

The committed `.codex/hooks.json` must be reproducible. Replace the absolute
`resolve(repoRoot, CODEX_MANAGED_HOOK_SUBDIR, ...)` launcher
(`agent-hooks/index.ts:83`) with the `$(git rev-parse --show-toplevel)`-anchored
form documented by Codex (`/usr/bin/... "$(git rev-parse --show-toplevel)/.codex/managed-hooks/<name>.sh"`).
This is cwd-stable (resolves the repo root regardless of session cwd) and
machine-independent. Keep the `[ -x <path> ] && <path> || <fallback>` guard
wrapper. Note the `git` dependency in the hook environment (acceptable: hooks run
inside the consumer git repo).

**Files:**
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/codex.ts`
- Modify: the emitter's colocated test

**Steps (TDD):**
1. Failing test: emitted Codex hook config contains no absolute path; two emits from different `repoRoot` values produce identical managed content.
2. Run — FAIL.
3. Implement portable launcher.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Codex hook config is path-neutral + deterministic across repoRoots
- [ ] Codex runtime still resolves the launcher

#### [scaffold] Task 3.2: Commit host hook configs (un-gitignore) with managed-region markers

**Status:** todo

**Depends:** Task 3.1

Treat `.claude/settings.json` + `.codex/hooks.json` as committed generated
artifacts. Stop gitignoring them (`gitignore-patcher.ts:55`, `.gitignore` block);
write a managed region (markers like the gitignore patcher's `>>>`/`<<<`) so
consumer-added hooks outside the region are preserved across re-setup.

**Files:**
- Modify: `src/cli/commands/init/gitignore-patcher.ts`
- Modify: the host-config scaffolder/emitter write path
- Modify/Create: colocated tests

**Steps (TDD):**
1. Failing test: after setup, `.claude/settings.json` + `.codex/hooks.json` are NOT gitignored; re-running setup preserves consumer hooks added outside the managed region.
2. Run — FAIL.
3. Implement un-ignore + managed-region write.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Host configs are tracked (not gitignored)
- [ ] Consumer-added hooks outside the managed region survive re-setup

#### [audit] Task 3.3: CI drift gate for committed host configs

**Status:** todo

**Depends:** Task 3.2

Add a guardrail audit that re-emits the host configs in memory from
`WP_HOOK_SPECS` and diffs the **managed region** against the committed files;
drift fails. `agents.checkHookFile` is unchanged and now passes on a clean
checkout (files are committed). Runtime `.sh` + manifest stay gitignored,
validated by `wp hooks doctor`.

**Files:**
- Create: `src/audit/hook-config-drift.ts` + colocated test
- Modify: guardrails registry to include it
- Modify: `src/audit/agents.ts` only if needed (expected: no change)

**Steps (TDD):**
1. Failing test: coherent committed config → audit PASS; tampered managed region → FAIL; consumer hook outside the managed region → PASS.
2. `./bin/wp test --file src/audit/hook-config-drift.test.ts` — FAIL.
3. Implement re-emit + managed-region diff.
4. Re-run — PASS. lint + typecheck.

**Acceptance:**
- [ ] Drift in the managed region fails the audit
- [ ] Clean checkout with committed configs passes
- [ ] Consumer additions outside the managed region do not trip the gate

#### [ci] Task 3.4: Simplify the shipped CI template

**Status:** todo

**Depends:** Task 3.3

With host configs committed + the drift gate, `ci.yml.tmpl` needs no hook
materialization. Use `wp audit` CLI forms for the secret checks (matching T1.x)
and drop the legacy `pnpm run verify:secrets` / `audit:secret-provider-quarantine`
steps.

**Files:**
- Modify: `catalog/base-kit/.github/workflows/ci.yml.tmpl`
- Modify: any base-kit test asserting CI template contents

**Steps (TDD):**
1. Failing test: ci.yml.tmpl runs `wp audit guardrails`, no `bun scripts/...` steps, no hook-materialization step.
2. Run — FAIL.
3. Update template.
4. Re-run — PASS.

**Acceptance:**
- [ ] CI template needs no hook-materialization step
- [ ] Secret checks use CLI forms

#### [test] Task 4.1: Meta-regression — fresh setup + secrets config → guardrails == 0 failures

**Status:** todo

**Depends:** Task 1.3, Task 2.2, Task 3.3

The recurrence gate. Scaffold a full `wp setup` into a `mkdtempSync` temp repo
with a valid `.webpresso/secrets.config.json` (else `no-dev-vars` +
`secret-provider-quarantine` skip — F6); run the full `guardrails` set; assert
zero failures.

**Files:**
- Create: `src/cli/commands/init/setup-guardrails-parity.integration.test.ts`
- Modify: `vitest.stryker.config.ts` exclude (heavy subprocess)

**Steps (TDD):**
1. Failing test: fresh setup + secrets config + `runGuardrails(tempRepo)` → 0 failures.
2. Run — FAIL.
3. Land after T1-T3; re-run — PASS.

**Acceptance:**
- [ ] Fresh setup + secrets config passes all guardrails
- [ ] Excluded from Stryker dry-run

#### [test] Task 4.2: Clean-checkout fixture → guardrails

**Status:** todo

**Depends:** Task 3.3

Covers D3: a committed-sources-only checkout (gitignored runtime `.sh` + manifest
absent, but committed `.claude/settings.json` / `.codex/hooks.json` present) must
pass `agents` and the drift gate.

**Files:**
- Modify: `src/cli/commands/init/setup-guardrails-parity.integration.test.ts`

**Steps (TDD):**
1. Failing test: setup, delete runtime `.sh` + manifest (keep committed configs), run guardrails → 0 failures.
2. Run — FAIL pre-Option-D.
3. After T3.x — PASS.

**Acceptance:**
- [ ] Guardrails pass with runtime hooks absent + committed configs present

#### [test] Task 4.3: Migration fixture (old generated artifacts → re-setup → guardrails)

**Status:** todo

**Depends:** Task 1.3

Proves the migration path and the divergent-content guard: seed a repo with old
generated scripts/values/hooks (plus one consumer-edited value), re-run setup,
then guardrails pass and the consumer edit survives.

**Files:**
- Modify: `src/cli/commands/init/setup-guardrails-parity.integration.test.ts`

**Steps (TDD):**
1. Failing test: seed legacy artifacts + a consumer-edited script value → setup → guardrails 0 failures AND the consumer edit is preserved.
2. Run — FAIL.
3. After T1.3 — PASS.

**Acceptance:**
- [ ] Migrated repo passes guardrails
- [ ] Consumer-edited content preserved

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2, 2.1, 3.1 | None | 4 agents | S-M |
| **Wave 1** | 1.4, 2.2, 3.2 | Wave 0 (1.1 / 2.1 / 3.1) | 3 agents | S-M |
| **Wave 2** | 1.3, 3.3 | 1.1+1.2 / 3.2 | 2 agents | M |
| **Wave 3** | 3.4, 4.1, 4.2, 4.3 | 3.3 / 1.3+2.2+3.3 | 4 agents | M |
| **Critical path** | 3.1 → 3.2 → 3.3 → 4.1 | — | 4 waves | L |

### Parallel Metrics Snapshot

| Metric | Meaning | Target | Actual |
| ------ | ------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 4 |
| CPR | total_tasks / critical_path_length (13 / 4) | ≥ 2.5 | 3.25 |
| DD | dependency_edges / total_tasks (~11 / 13) | ≤ 2.0 | 0.85 |
| CP | same-file overlaps per wave | 0 | 0 |

Parallelization score: **A** (RW0=4, CPR 3.25, CP=0).

## Risks

| ID | Risk | Severity | Mitigation |
| -- | ---- | -------- | ---------- |
| R1 (F5) | Committing a non-deterministic Codex config (absolute paths) breaks the drift gate | CRITICAL | T3.1 makes the Codex emitter path-neutral before committing |
| R2 (F9) | Committing host configs clobbers consumer-added hooks | HIGH | Managed-region markers (T3.2); drift gate only diffs the managed region (T3.3) |
| R3 (F2/F10) | Migration clobbers consumer-edited script values | HIGH | Exact-value gate + divergent-content test (T1.3, T4.3) |
| R4 (F6) | Meta-test green but audits silently skipped | HIGH | Fixtures include `.webpresso/secrets.config.json` + clean-checkout mode |
| R5 (F8) | agent-kit's own build breaks when legacy scripts removed | MEDIUM | T1.4 repoints `package.json` + `public-readiness.ts` |
| R6 (F7) | Date drift from re-rendered SKILL.md | MEDIUM | Preserve dates + idempotency test (T2.1, T2.2) |
| R7 | Cross-repo publish lag | MEDIUM | Ship via changesets; consumers bump catalog + re-setup; ozby-dev interim stays until then |
| R8 (F5) | Committed Codex launcher uses `$(git rev-parse --show-toplevel)` — needs `git` on PATH in the hook env | LOW | Acceptable: Codex hooks run inside the consumer git repo; matches Codex's documented hook pattern. The existing `[ -x … ] || fallback` guard degrades gracefully if resolution fails. |

## Cross-Plan References

- `blueprints/planned/2026-06-13-reference-parity-regression-and-host-smoke-gate.md` —
  this is a concrete regression gate under that umbrella.
- Completed `centralize-consumer-governance-scripts-as-wp-audit-subcommands` —
  established the `wp audit` CLI forms that replace the legacy bun scripts.
- Consumer interim: `ozby/ozby-dev` `src/ci-governance-contract.test.ts` +
  `wp setup --restore-hooks` CI step; retire after this lands and the catalog bumps.

## Verification standard

Behavioural change (byte-identity N/A). Each task ships a failing test first; the
meta-test (T4.x) is the acceptance gate. Public-package safety: T1.4 + T3.4 touch
`package.json` / templates — run the package-surface check before release.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ✅ PASS | 4 findings; Option C proposal superseded by eng-review research (Option D) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ PASS | 5 findings (1 P1 root-cause correction, 4 P2/P3); all folded |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | n/a | no UI surface |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | — |

**CODEX:** Read agent-kit source; rejected Options A/B, proposed Option C (separate WP_HOOK_SPECS contract). Surfaced incomplete migration (F2), meta-test gaps (F6), agent-kit's own legacy-script dependents (F8), date drift (F7).

**ENG REVIEW:** Caught that D3's root cause was misidentified — the `agents` failure is `agents.ts checkHookFile` requiring gitignored `.claude/settings.json` / `.codex/hooks.json`, not `hook-vendor-drift` (warning-only) (F4). Found the Codex emitter's absolute-path determinism blocker (F5), migration divergent-content risk (F10), and clean-checkout fixture gap (F11). Web research (Husky/Lefthook commit hook config; generate→commit→drift-gate per protobuf/go-generate/connect-rust; reproducible-builds determinism) produced **Option D**, adopted over Codex's Option C: commit the host configs as deterministic generated artifacts, drift-gate the managed region — no separate contract artifact, no audit fail-open. Scope kept as one blueprint per user decision.

**CROSS-MODEL:** Codex and eng-review agree on D1/D2 and on fixing F5/F7 determinism; they diverge on D3 mechanism — eng-review's source read (checkHookFile) + research superseded Codex's contract proposal. Resolved in favor of Option D.

**VERDICT:** ENG + CODEX CLEARED — ready to implement once the open decisions below are closed at implementation time.

**UNRESOLVED DECISIONS:**
- Managed-region marker format for JSON host configs (`.claude/settings.json` / `.codex/hooks.json`) — JSON has no comment syntax, so the managed region needs a key-namespacing or sentinel-key convention (T3.2) rather than `>>>`/`<<<` line markers. (Resolved at implementation; only open item.)

_Resolved during eng-review (2026-06-13): `.codex/hooks.json` CAN be committed deterministically — Codex's own docs anchor hook commands with `$(git rev-parse --show-toplevel)` (cwd-stable, machine-independent), superseding the absolute `resolve()` path. Option D is symmetric across Claude + Codex; no fail-open needed (F5, T3.1)._
