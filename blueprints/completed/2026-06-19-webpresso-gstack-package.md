---
type: blueprint
title: Webpresso-owned gstack-derived skill package
owner: ozby
status: completed
complexity: L
created: '2026-06-19'
last_updated: '2026-06-20'
progress: '100% (implemented; review follow-up hardened)'
depends_on: []
cross_repo_depends_on: []
tags:
  - gstack
  - skills
  - claude
  - codex
  - package-surface
  - provenance
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Webpresso-owned gstack-derived skill package

## Goal

Absorb the useful MIT-licensed gstack workflow ideas into Webpresso-owned Claude and Codex skill surfaces so users no longer need a separate `~/.claude/skills/gstack` checkout. The shipped skills must feel native to agent-kit: unprefixed, sleek, fast, package-safe, and intentionally curated rather than a wholesale upstream fork.

## Product wedge anchor

- **Outcome:** `wp setup` / `wp update` installs Webpresso-owned Claude and Codex workflow skills from `@webpresso/agent-kit`; the user can remove the external gstack checkout.
- **Audience:** agent-kit users who want plan reviews, outside voice, and review workflows without maintaining a separate gstack installation.
- **Non-goal:** easy perpetual upstream sync. Future upstream refreshes can be separate blueprint work. V1 optimizes for product fit, package size, and deterministic safety.
- **Hard boundary:** no upstream prebuilt binaries, no `node_modules`, no browser/design/make-pdf runtime payloads, no Playwright/Puppeteer/HuggingFace/ngrok/html-to-docx dependency chain in the default agent-kit package.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | S |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 agents | S-M |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | M |
| **Wave 3** | 4.1 | Wave 2 | 1 agent | M |
| **Wave 4** | 5.1 | Wave 3 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 → 5.1 | — | 5 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 3 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.2 |
| CP | same-file overlaps per wave | 0 | 0 |

**Refinement delta:** CPR is below the ideal 2.5 because public package staging, generated skill installation, and migration must sequence after the package-surface allowlist exists. The plan keeps Wave 0 broad enough for parallel setup without allowing shared-file conflicts.

---

## Technology Choices

| Choice | Decision | Rationale | Fix |
| ------ | -------- | --------- | --- |
| Source boundary | Private workspace package `packages/gstack` named `@repo/gstack` | Gives build/test isolation while preventing a public dependency leak | Fx1 |
| Upstream sync | One-time curated source mine with provenance, not perpetual overlay | User prefers sleek Webpresso fit over easy sync; large sync can be later blueprint work | Fx2 |
| Runtime payload | Markdown skill sources + tiny POSIX helpers only | Upstream install is >1GB and includes ~61MB binary artifacts; bundling them violates package-sleek requirement | Fx3 |
| Public surface | Stage allowlisted Claude/Codex generated skills into `@webpresso/agent-kit` | Users install one agent-kit package; private workspace deps do not leak | Fx4 |
| Skill names | Unprefixed Webpresso-owned names | User explicitly wants skills considered ours, not `gstack-*` | Fx5 |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | CRITICAL | We can bundle gstack runtime into agent-kit without bloat. | Local upstream install is about 1.1GB with `node_modules`; source excluding `.git`, `node_modules`, and generated host dirs is still about 366MB due prebuilt artifacts. | Fx3 — hard no-binary/no-heavy-dep gate. |
| F2 | CRITICAL | Public package can include curated skill assets without special checks. | Repo public package policy treats tarballs as disclosure surfaces and requires explicit file/bin/export checks. | Fx4 — package-surface allowlist and tarball size tests are first-class. |
| F3 | HIGH | MIT license lets us detach without ongoing obligations. | MIT permits modification/distribution but requires preserving copyright/license notices in substantial copies. | Fx6 — provenance and NOTICE are publish-blocking gates. |
| F4 | HIGH | Current agent-kit policy already supports this direction. | `catalog/agent/rules/gstack-routing.md` currently says gstack is not bundled and hard-rules never replicate skills. | Fx7 — replace policy deliberately. |
| F5 | HIGH | Existing gstack setup/update can remain unchanged. | `wp setup`/`wp update` currently clone/pull upstream gstack and run upstream `./setup`. | Fx8 — migrate to Webpresso staging/install path. |
| F6 | HIGH | Claude auth needs API key or credentials file. | User's Claude CLI is logged in with first-party `claude.ai`; upstream gstack's gate misses that. | Fx9 — detect `claude auth status` plus existing fallbacks. |
| F7 | MEDIUM | `mktemp /tmp/name-XXXXXX.patch` is portable. | macOS `mktemp` requires Xs at the end; suffix after Xs fails. | Fx10 — use portable temp-file pattern and test. |
| F8 | MEDIUM | Unprefixed skill names are safe by default. | Generic names like `review` and `ship` can collide with other skill packs. | Fx11 — generated skill collision audit. |

---

## Architecture Review

### Staging pipeline

```
packages/gstack (private source)
  ├─ skills/*.md / helpers/*.sh
  ├─ provenance/upstream-gstack.json
  └─ NOTICE.gstack.md
        │
        ▼  build/stage script with allowlist + denied-content checks
@webpresso/agent-kit public package assets
  ├─ skills/<unprefixed Webpresso skills>
  ├─ commands/setup/update integration
  └─ THIRD-PARTY-NOTICES.md attribution
```

The staging script is the security boundary. It must copy only allowlisted assets and must fail on upstream binaries, generated host directories, private workspace imports, or heavyweight dependency names.

### Why not a full fork

A full fork structurally invites dragging upstream browser, design, make-pdf, iOS, generated host outputs, and large runtime artifacts into git history and the public tarball. V1 imports only the workflow content that directly improves agent-kit: Claude outside voice, plan reviews, and diff review.

### Local gstack removal

Removing `~/.claude/skills/gstack` mutates user-owned home state. It must never happen implicitly. The implementation requires an explicit command/flag, dry-run output, backup, idempotency, and clear refusal without opt-in.

---

## Edge Cases

| # | Edge Case | Severity | Handling | Fix |
| -- | --------- | -------- | -------- | --- |
| E1 | Packed tarball includes upstream binary or `node_modules` | CRITICAL | Tarball audit fails on path/content patterns and size budget | Fx3 |
| E2 | MIT attribution missing from staged derived assets | CRITICAL | Package-surface gate requires NOTICE/provenance files | Fx6 |
| E3 | `@repo/gstack` leaks into packed dependencies | HIGH | Prepack/manifest tests assert no workspace private dep | Fx4 |
| E4 | Existing external gstack shadows Webpresso skill names | HIGH | Setup warns, collision check reports, optional migration backs up/removes external checkout | Fx8, Fx11 |
| E5 | Other installed skill packs own `review` or `ship` | MEDIUM | Collision audit runs before install and reports exact path/name conflict | Fx11 |
| E6 | Claude auth uses first-party login without API key | HIGH | Auth helper checks `claude auth status` before env/file fallback | Fx9 |
| E7 | macOS temp file suffix breaks nested Claude review | MEDIUM | Portable `mktemp -t` pattern and Darwin test | Fx10 |

## Risks

| Risk | Severity | Mitigation | Fix |
| ---- | -------- | ---------- | --- |
| Package bloat makes `wp` slow/heavy | CRITICAL | No binaries/heavy deps; tarball size ceiling; browser/design deferred | Fx3 |
| Public package leaks internal/private content | CRITICAL | Allowlist staging + package-surface guardrail | Fx4 |
| Legal attribution regression | HIGH | MIT NOTICE/provenance publish-blocking tests | Fx6 |
| User data loss from removing external gstack checkout | HIGH | Opt-in flag, dry-run, backup, idempotency, refusal without flag | Fx8 |
| Skill name conflicts break other toolchains | HIGH | Collision audit and install refusal/reporting | Fx11 |

---

## Tasks

#### [package] Task 1.1: Scaffold private `@repo/gstack` package

**Status:** done

**Depends:** None

Create `packages/gstack` as a private ESM workspace package that holds Webpresso-owned gstack-derived skill source, provenance, and tests. It must not be publishable in v1.

**Files:**

- Create: `packages/gstack/package.json`
- Create: `packages/gstack/README.md`
- Create: `packages/gstack/src/index.ts`
- Modify: `pnpm-workspace.yaml` only if needed by validation

**Steps (TDD):**

1. Write package metadata test/assertion that `private: true`, `type: module`, and no public publish config exists
2. Run: `vp run typecheck` — verify expected failure until package config/source exists
3. Create package scaffold and minimal export
4. Run: `vp run typecheck` — verify PASS for new package surface
5. Run: `vp run lint` on changed files if supported, otherwise full `vp run lint`

**Acceptance:**

- [x] `packages/gstack` exists as private package
- [x] Package cannot be published accidentally
- [x] No parent-relative imports are introduced
- [x] Typecheck/lint pass for scaffold

#### [provenance] Task 1.2: Add upstream provenance and MIT notice contract

**Status:** done

**Depends:** None

Add provenance metadata for the imported upstream gstack commit and the MIT license notice required for derived files.

**Files:**

- Create: `packages/gstack/provenance/upstream-gstack.json`
- Create: `packages/gstack/NOTICE.gstack.md`
- Create: `packages/gstack/src/provenance.test.ts`
- Modify: `THIRD-PARTY-NOTICES.md`

**Steps (TDD):**

1. Write failing test that requires upstream repo URL, commit SHA, version, license, imported skill list, excluded payload list
2. Run targeted test — verify FAIL
3. Add provenance JSON and NOTICE content
4. Update root third-party notices to describe derived Webpresso skill assets
5. Run targeted test — verify PASS

**Acceptance:**

- [x] Upstream repo, commit, version, and MIT license are recorded
- [x] NOTICE is present and referenced from package-surface checks
- [x] Excluded binary/heavy paths are explicitly listed

#### [surface] Task 1.3: Define public staging allowlist and denied-content rules

**Status:** done

**Depends:** None

Create the allowlist/denylist contract that determines what `@webpresso/agent-kit` may ship from `@repo/gstack`.

**Files:**

- Create: `packages/gstack/staging/allowlist.json`
- Create: `packages/gstack/src/staging-policy.test.ts`
- Modify: package-surface contract fixture/config if present

**Steps (TDD):**

1. Write failing tests for deny patterns: `node_modules`, `.git`, generated host dirs, `browse/dist`, `design/dist`, `make-pdf/dist`, `*.node`, heavy dependency names
2. Run targeted test — verify FAIL
3. Add allowlist and denied-content rules
4. Run targeted test — verify PASS
5. Run package-surface audit in dry mode if available

**Acceptance:**

- [x] Staging policy denies upstream binaries and heavy deps
- [x] Staging policy names the only v1 skills allowed to ship
- [x] Size budget is represented in the package-surface contract

#### [build] Task 2.1: Implement gstack skill staging script

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3

Implement a deterministic staging script that copies only allowlisted Webpresso skill assets from `packages/gstack` into the public agent-kit package assets.

**Files:**

- Create: `scripts/stage-gstack-skills.ts`
- Create: `scripts/stage-gstack-skills.test.ts`
- Modify: `package.json`

**Steps (TDD):**

1. Write failing tests for allowlisted copy, denied binary rejection, missing NOTICE rejection, and deterministic output
2. Run targeted test — verify FAIL
3. Implement staging script
4. Wire script into build/prepack path after local skill generation and before package-surface checks
5. Run targeted test — verify PASS

**Acceptance:**

- [x] Only allowlisted Claude/Codex skill assets are staged
- [x] Denied files fail the build
- [x] NOTICE/provenance absence fails the build
- [x] Script is deterministic

#### [skills] Task 2.2: Add v1 Webpresso-owned skill sources

**Status:** done

**Depends:** Task 1.1, Task 1.2

Import and rewrite the v1 skill set as Webpresso-owned skills, removing gstack branding/prefixes and preserving useful methodology only where it fits agent-kit.

**Files:**

- Create: `packages/gstack/skills/claude.md`
- Create: `packages/gstack/skills/plan-eng-review.md`
- Create: `packages/gstack/skills/plan-ceo-review.md`
- Create: `packages/gstack/skills/plan-design-review.md`
- Create: `packages/gstack/skills/review.md`

**Steps (TDD):**

1. Write text-contract tests for no `gstack-*` invocation names, no upstream install paths, no browser/design/make-pdf references in v1 skills
2. Run targeted test — verify FAIL
3. Add rewritten skill sources with provenance comments
4. Run targeted test — verify PASS
5. Run generated skill catalog check if available

**Acceptance:**

- [x] V1 skills are unprefixed and Webpresso-owned
- [x] No user-facing instruction requires `~/.claude/skills/gstack`
- [x] No heavy runtime workflow is referenced as available in v1

#### [policy] Task 2.3: Replace external gstack routing policy

**Status:** done

**Depends:** Task 1.2

Replace the current policy that bans replication with a policy describing Webpresso-owned curated skill imports and the external gstack retirement path.

**Files:**

- Modify: `catalog/agent/rules/gstack-routing.md`
- Modify: `catalog/AGENTS.md.tpl`
- Modify: `compatible-versions.json`

**Steps (TDD):**

1. Add failing docs/catalog audit expectation for no “never replicate gstack” hard rule
2. Run catalog audit — verify FAIL
3. Rewrite policy to describe curated Webpresso-owned skills and optional later upstream refresh blueprint
4. Update compatible versions to remove “gstack consumed at HEAD” as current behavior
5. Run catalog audit — verify PASS

**Acceptance:**

- [x] Policy no longer instructs agents to rely on external gstack checkout
- [x] Policy preserves attribution/provenance gate
- [x] `compatible-versions.json` reflects new ownership model

#### [auth] Task 3.1: Fix Claude auth and temp-file helpers

**Status:** done

**Depends:** Task 2.2

Implement Webpresso-owned helper behavior for nested Claude outside-voice flows: first-party Claude CLI auth detection, API-key fallback, credentials fallback, and portable temp files.

**Files:**

- Modify: `packages/gstack/skills/claude.md`
- Create: `packages/gstack/src/claude-auth.test.ts`
- Create: `packages/gstack/src/tempfile.test.ts`

**Steps (TDD):**

1. Write failing tests for `claude auth status` logged-in JSON, API key fallback, credentials fallback, missing auth, and Darwin `mktemp` safety
2. Run targeted tests — verify FAIL
3. Implement helper snippets/source text
4. Run targeted tests — verify PASS
5. Smoke-run generated Claude skill in no-edit mode if safe

**Acceptance:**

- [x] First-party `claude.ai` login passes auth detection
- [x] API-key and credentials-file paths remain supported
- [x] Missing auth produces clear instruction
- [x] macOS temp-file pattern is portable

#### [install] Task 3.2: Add skill collision audit for Claude and Codex

**Status:** done

**Depends:** Task 2.1, Task 2.2

Detect collisions between unprefixed Webpresso skills and already-installed skill packs before installation/staging.

**Files:**

- Create: `src/cli/commands/init/scaffolders/gstack/collision-audit.ts`
- Create: `src/cli/commands/init/scaffolders/gstack/collision-audit.test.ts`
- Modify: `src/cli/commands/init/scaffolders/gstack/index.ts`

**Steps (TDD):**

1. Write failing tests for collision detection in Claude and Codex skill roots
2. Run targeted tests — verify FAIL
3. Implement collision audit returning structured warnings/refusals
4. Wire audit into setup path before installing unprefixed skills
5. Run targeted tests — verify PASS

**Acceptance:**

- [x] Existing conflicting skill names are reported with path/name
- [x] Install does not silently shadow another skill pack
- [x] Non-conflicting installs remain quiet

#### [migration] Task 4.1: Replace upstream clone/pull setup with Webpresso install and opt-in cleanup

**Status:** done

**Depends:** Task 2.1, Task 2.3, Task 3.2

Update `wp setup` and `wp update` so they install/stage Webpresso-owned skills instead of cloning/pulling upstream gstack. Add an explicit cleanup path for external `~/.claude/skills/gstack`.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/gstack/index.ts`
- Modify: `src/cli/commands/package-manager.ts`
- Create: `src/cli/commands/init/scaffolders/gstack/migration.test.ts`

**Steps (TDD):**

1. Write failing tests that setup/update no longer call `git clone garrytan/gstack` or upstream `./setup`
2. Write failing cleanup tests: dry-run, refuses without explicit flag, backup-created, idempotent, printed removals
3. Run targeted tests — verify FAIL
4. Implement Webpresso staging/install path and explicit cleanup flag/command behavior
5. Run targeted tests — verify PASS
6. Run integration tests for init presets touching gstack

**Acceptance:**

- [x] `wp setup --with gstack` no longer clones upstream gstack
- [x] `wp update` no longer pulls upstream gstack
- [x] Cleanup of `~/.claude/skills/gstack` is explicit, backed up, and idempotent
- [x] Claude and Codex install paths are covered

#### [release] Task 5.1: Final public package and docs verification

**Status:** done

**Depends:** Task 4.1

Run final packaging, docs, and blueprint verification to ensure the new package is sleek and safe.

**Files:**

- Modify: `README.md`
- Modify: `docs/skills-catalog.md`
- Modify: `THIRD-PARTY-NOTICES.md`
- Modify: `blueprints/planned/2026-06-19-webpresso-gstack-package.md`

**Steps (TDD):**

1. Update docs to describe Webpresso-owned skills and external gstack cleanup path
2. Run `vp run blueprints:check`
3. Run `vp run build`
4. Run `vp run typecheck`
5. Run `vp run lint`
6. Run `vp run test`
7. Run `vp run lint:pkg`
8. Run package-surface/tarball audit and verify size budget

**Acceptance:**

- [x] Docs no longer instruct users to install external gstack for v1 workflows
- [x] Tarball excludes denied upstream payloads
- [x] LICENSE/NOTICE/provenance are present
- [x] Full verification commands pass or blockers are recorded with evidence

---

## Acceptance Criteria

- [x] A private `@repo/gstack` package exists and cannot publish accidentally.
- [x] Public `@webpresso/agent-kit` ships only staged allowlisted Webpresso skill assets.
- [x] Resulting Claude/Codex skills are unprefixed and do not require external `~/.claude/skills/gstack`.
- [x] Upstream MIT attribution and provenance are included.
- [x] No upstream binaries, `node_modules`, generated host dirs, or heavyweight deps ship.
- [x] `wp setup`/`wp update` stop cloning/pulling upstream gstack.
- [x] External gstack cleanup is explicit, backed up, idempotent, and verified.
- [x] Package-surface, tarball, typecheck, lint, tests, and blueprint checks pass.


## Implementation Evidence

Implemented on 2026-06-20:

- Added private workspace package `packages/gstack` named `@repo/gstack` with provenance, NOTICE, allowlist, and focused tests.
- Added deterministic `scripts/stage-gstack-skills.ts` staging only the allowlisted v1 skills: `claude`, `plan-eng-review`, `plan-ceo-review`, `plan-design-review`, and `review`.
- Staged unprefixed Webpresso-owned Claude/Codex skill assets under public package skill catalogs without bundling upstream heavy runtime payloads.
- Replaced upstream clone/pull setup behavior with package-local skill installation, collision audit, and explicit `WP_GSTACK_CLEANUP_EXTERNAL=1` backup path for old external checkouts.
- Updated `wp update` so gstack refresh is satisfied by the Webpresso package/plugin refresh path rather than pulling upstream.
- Updated docs, third-party notices, compatibility metadata, and package manager/scaffolder tests.
- G007/G010 review follow-up replaced the Claude skill auth snippet's fixed `/tmp/wp-claude-auth.json` path with a `mktemp -t` file plus explicit unrecognized-auth failure, expanded the staging size budget to all `packages/gstack` source files, and recorded the real upstream gstack commit `a861c00cfac6e2376d26c7d3ba5207cdc5aefc49`.

Verification evidence:

- `./bin/wp test --file scripts/stage-gstack-skills.test.ts --file src/cli/commands/init/scaffolders/gstack/index.test.ts --file src/cli/commands/init/scaffolders/gstack/collision-audit.test.ts --file src/cli/commands/init/scaffolders/gstack/migration.test.ts --file src/cli/commands/package-manager.test.ts --file src/cli/commands/package-manager.gstack.test.ts --file packages/gstack/src/claude-auth.test.ts --file packages/gstack/src/provenance.test.ts --file packages/gstack/src/skill-text.test.ts --file packages/gstack/src/staging-policy.test.ts --file src/audit/open-source-licenses.test.ts`
- `pnpm --filter @repo/gstack test`
- `pnpm --filter @repo/gstack typecheck`
- `vp run typecheck`
- Targeted changed-surface tests and package build/lint gates were rerun before commit; broad lint is rerun again after rebasing onto current `origin/main` because the pre-rebase branch inherited baseline lint failures outside this lane.

### G011 final-review follow-up (2026-06-20)

- The curated Claude skill now treats first-party auth as present only when `claude auth status --output json` includes an explicit truthy auth field; a JSON payload with `provider: claude.ai` but `loggedIn: false` no longer passes.
- Public gstack attribution now points to shipped `THIRD-PARTY-NOTICES.md`/manifest summaries instead of private `packages/gstack/...` provenance paths that package consumers cannot read.
- Regression coverage: `packages/gstack/src/skill-text.test.ts` and `src/audit/package-surface.test.ts`; generated `catalog/agent/skills/claude/SKILL.md` and `skills/claude/SKILL.md` were regenerated from source.
