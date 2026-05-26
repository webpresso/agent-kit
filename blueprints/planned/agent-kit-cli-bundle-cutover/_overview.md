---
type: blueprint
status: planned
complexity: M
created: 2026-05-26
last_updated: 2026-05-26
refined: 2026-05-26
scope_repo: /Users/ozby/repos/webpresso/agent-kit
cross_repo_touch:
  - /Users/ozby/repos/webpresso/monorepo
  - /Users/ozby/repos/webpresso/framework
respects_decisions:
  - monorepo/docs/system/decisions/0042-unified-cli-platform-cutover.md
  - monorepo/docs/research/2026-05-25-webpresso-package-naming-research.md
---

# Agent-Kit CLI Bundle Cutover

## Goal

Move `@webpresso/agent-kit` from an independent command host to a first-party
agent bundle consumed by the unified Webpresso CLI host. Keep agent-kit as the
package/source owner for `.agent/`, AGENTS.md templates, skills, hooks, catalog
sync, and blueprint tooling, but stop presenting it as the durable owner of
`wp`, `ak`, or `webpresso` binaries.

## Verified context

- `@webpresso/agent-kit` currently exposes `wp` and `webpresso` bins from
  `src/cli/cli.ts`.
- Unified CLI ADR 0042 assigns public binary ownership to `@webpresso/cli` and
  rejects long-term `wp`, `cli2`, `wk`, or hook-helper compatibility shims.
- Unified CLI PRD maps agent-kit commands to `webpresso agent ...` and related
  `webpresso ...` host commands.
- Package naming research says not to reuse `@webpresso/webpresso` for tooling;
  agent-kit remains a distinct tooling package identity.

## Architecture overview

`@webpresso/agent-kit` becomes a bundle provider:

```text
@webpresso/agent-kit
  ├─ owns agent assets and implementation
  ├─ exports agent bundle definitions against @webpresso/cli-contract
  └─ no longer owns durable public command binaries

@webpresso/cli
  └─ mounts agent bundle as webpresso agent ...
```

## Technology choices

| Choice | Decision | Rationale |
| --- | --- | --- |
| Package identity | Keep `@webpresso/agent-kit` | Distinct scoped tooling package avoids framework/tooling collision. |
| Command identity | Mount under `webpresso agent ...` | One public CLI brand with explicit agent namespace. |
| Host contract | Target `@webpresso/cli-contract` | Parser/framework choice stays host-private. |
| Compatibility | Hard-cut active docs/scripts | Matches ADR 0042 and prevents ambiguous DevEx. |

## Edge cases

| ID | Severity | Case | Handling |
| --- | --- | --- | --- |
| E1 | HIGH | Consumer runs `wp setup` from stale docs | Error or docs replacement must point to `webpresso agent setup`. |
| E2 | HIGH | Agent bundle leaks internal hook helpers as user commands | Bundle metadata must mark helper commands hidden or non-distributed. |
| E3 | MEDIUM | Generated AGENTS.md says “managed by webpresso” for agent-owned blocks | Templates must use precise owner text: agent-kit or Webpresso CLI. |
| E4 | MEDIUM | Existing tests assert old bin names | Replace assertions with bundle/host registration tests. |

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Bin removal breaks local scripts | HIGH | Coordinate monorepo script cutover in the paired monorepo blueprint before release. |
| Bundle contract drifts from host implementation | HIGH | Add contract tests that exercise agent command registration through the host. |
| Docs keep mixed `wp`/`webpresso` language | MEDIUM | Add active-doc grep gate with migration-history allowlist. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | XS-S |
| **Wave 1** | 2.1, 2.2 | Wave 0 | 2 agents | S |
| **Wave 2** | 3.1 | Wave 1 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

## Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 3 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.8 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: Wave width is acceptable for this repo because the cutover has
one natural serialization point: host-contract registration must exist before
final bin removal can be verified.

## Tasks

### Tier 0 — independent bundle preparation

#### [contract] Task 1.1: Define agent bundle export surface

**Status:** todo

**Depends:** None

Create the public bundle entrypoint that exposes agent-kit command definitions
against the unified CLI contract. Keep implementation code in agent-kit, but make
the exported surface host-neutral and free of parser-specific `cac` details.

**Files:**

- Create: `src/cli/bundle/index.ts`
- Create: `src/cli/bundle/index.test.ts`
- Modify: `package.json`

**Steps (TDD):**

1. Write failing tests that import the bundle and assert stable command ids for setup, sync, audit, skills, docs, hooks, and blueprint commands.
2. Run: `pnpm test -- src/cli/bundle/index.test.ts` — verify FAIL.
3. Implement the bundle export using `@webpresso/cli-contract` types.
4. Run: `pnpm test -- src/cli/bundle/index.test.ts` — verify PASS.
5. Refactor if needed so bundle assembly stays obvious and low-complexity.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] Bundle entrypoint exists and is host-neutral.
- [ ] Tests prove command ids and namespace roots.
- [ ] `pnpm test -- src/cli/bundle/index.test.ts` passes.
- [ ] `pnpm typecheck` and `pnpm lint` pass.

#### [docs] Task 1.2: Rewrite generated owner language

**Status:** todo

**Depends:** None

Update catalog templates so generated agent-surface docs describe the exact
owner. Agent-kit-owned generated blocks should say agent-kit. Host-level commands
should say Webpresso CLI.

**Files:**

- Modify: `catalog/AGENTS.md.tpl`
- Modify: `src/cli/commands/init/scaffold-agents-md.test.ts`

**Steps (TDD):**

1. Write failing snapshot/assertion coverage for precise owner language.
2. Run: `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` — verify FAIL.
3. Replace stale `wp setup`, `wp sync`, and “managed by webpresso” language where it describes agent-kit surfaces.
4. Run: `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` — verify PASS.
5. Refactor wording only where needed.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] Generated templates no longer blur framework, CLI, and agent-kit ownership.
- [ ] Tests assert the new language.
- [ ] No generated-surface files are hand-edited.

#### [audit] Task 1.3: Add active legacy command grep gate

**Status:** todo

**Depends:** None

Add an audit that fails on active `wp`, `ak`, `cli2`, or `wk` command mentions
outside migration-history allowlists. This prevents old command docs from
reappearing after the hard cut.

**Files:**

- Create: `src/cli/commands/audit/no-legacy-cli-bin.ts`
- Create: `src/cli/commands/audit/no-legacy-cli-bin.test.ts`
- Modify: `src/cli/commands/audit.ts`

**Steps (TDD):**

1. Write failing tests with allowed migration-history fixtures and rejected active-doc fixtures.
2. Run: `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts` — verify FAIL.
3. Implement the audit with an explicit allowlist.
4. Run: `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts` — verify PASS.
5. Refactor if needed to keep allowlist readable.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] Active docs/scripts cannot introduce legacy command names unnoticed.
- [ ] Migration-history docs remain allowed.
- [ ] Audit is wired into the existing audit command surface.

### Tier 1 — command cutover

#### [cli] Task 2.1: Remove durable public bin ownership

**Status:** todo

**Depends:** Task 1.1, Task 1.3

Remove agent-kit-owned durable `wp`, `ak`, and `webpresso` command hosting after
the bundle export and audit gate exist. Keep non-user-facing hook helper bins
only if they are still required by generated hook configuration and explicitly
documented as helper internals.

**Files:**

- Modify: `package.json`
- Modify: `package.contract.test.ts`
- Modify: `src/cli/cli.ts`

**Steps (TDD):**

1. Update tests to fail while `wp`, `ak`, or `webpresso` are still durable public bins.
2. Run: `pnpm test -- package.contract.test.ts` — verify FAIL.
3. Remove or reclassify public bin entries according to the unified CLI contract.
4. Run: `pnpm test -- package.contract.test.ts` — verify PASS.
5. Refactor CLI entrypoint code only after tests prove the boundary.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] `@webpresso/agent-kit` no longer owns durable public CLI brand bins.
- [ ] Any remaining helper bins are explicitly internal and tested as such.
- [ ] Package contract tests encode the boundary.

#### [migration] Task 2.2: Add replacement-command diagnostics

**Status:** todo

**Depends:** Task 1.1

Where agent-kit still detects stale invocations or renders migration guidance,
make every message include the exact replacement under `webpresso agent ...`.

**Files:**

- Modify: `src/cli/auto-update/detect-pm.ts`
- Modify: `src/cli/auto-update/detect-pm.test.ts`
- Modify: `CHANGELOG.md`

**Steps (TDD):**

1. Write failing tests for stale command diagnostics and replacement text.
2. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify FAIL.
3. Implement explicit replacements for setup, sync, audit, docs, skills, hooks, test, e2e, and tech-debt commands.
4. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify PASS.
5. Refactor message construction to avoid duplicated replacement tables.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] Stale command guidance is actionable.
- [ ] No message points users back to `wp` or `ak`.
- [ ] Changelog records the hard-cut behavior.

### Tier 2 — verification

#### [qa] Task 3.1: Verify detached consumer setup path

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Run the detached consumer setup flow through the new host-mounted agent commands
and prove generated files, hook commands, and docs no longer rely on legacy bins.

**Files:**

- Modify: `src/cli/commands/init/init.e2e.test.ts`
- Modify: `test-fixtures/bundle-smoke/package.json`

**Steps (TDD):**

1. Update e2e expectations to invoke `webpresso agent setup`.
2. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify FAIL before cutover wiring is complete.
3. Complete fixture and test updates for the host-mounted path.
4. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify PASS.
5. Refactor fixtures only if they duplicate command setup.
6. Run: `pnpm qa`.

**Acceptance:**

- [ ] Detached setup works through `webpresso agent setup`.
- [ ] Generated hooks do not call removed public bins.
- [ ] `pnpm qa` passes.

## Verification gates

- `pnpm test -- src/cli/bundle/index.test.ts`
- `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts`
- `pnpm test -- package.contract.test.ts`
- `pnpm test -- src/cli/commands/init/init.e2e.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm qa`
