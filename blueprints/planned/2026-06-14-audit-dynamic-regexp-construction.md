---
type: blueprint
title: Audit dynamic RegExp construction
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/3 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - regex
  - input-validation
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Audit dynamic RegExp construction

**Goal:** Consolidate the five duplicated `escapeRegExp` helpers onto the canonical `escapeRegex` export, normalize the one divergent variant (`architecture-drift.ts`, which is missing `*` in its char class), and add a length bound to the one genuinely user-facing dynamic case (`search-files.ts` syntax-validation). This is primarily DRY/correctness cleanup, not a ReDoS remediation — see the Refinement Summary for the downgraded findings.

## Product wedge anchor

- **Stage outcome:** Agent-kit governance hardening — `wp audit architecture-drift` and `wp audit package-surface` rely on `escapeRegExp` to escape user/config-supplied identifiers before matching. The `architecture-drift.ts` copy silently drops `*` from its escape set, so an identifier containing `*` is matched as a wildcard rather than a literal, producing wrong audit results. Consolidating onto the canonical helper fixes that correctness gap for the audit surface.
- **Consuming surface:** `wp audit architecture-drift` and `wp audit package-surface` CLI verbs (`src/audit/architecture-drift.ts`, `src/audit/package-surface.ts`) — both call their local `escapeRegExp` while scanning import paths/package surfaces.
- **New user-visible capability:** After this lands, `wp audit architecture-drift` correctly escapes `*`-bearing identifiers (today it under-escapes), so audit findings for paths/packages containing regex metacharacters are accurate instead of silently mismatched.

## Quick Reference

| Key | Value |
| --- | ----- |
| Total `new RegExp` sites (non-test) | **50** |
| Genuinely user-facing dynamic sites | **0 executed** (search-files regex is syntax-validated then discarded; package-surface/validate-command inputs are *intentional* user regex/glob) |
| Static/trivial sites | **~43** (constants, `String.raw`, source-reuse, or internal-only) |
| Duplicate `escapeRegExp` helpers | **5 duplicates** of **1 canonical** (`escapeRegex`) — 3 escape-body variants |
| Canonical `escapeRegex` export | `src/blueprint/utils/string.ts:7` |
| Complexity | S (scope cut after fact-check downgraded the HIGH find) |

## Parallel Metrics Snapshot

| Metric | Count | Tool |
| ------ | ----- | ---- |
| `new RegExp` in `src/` (excl. tests) | 50 | `grep -rn 'new RegExp' src --include='*.ts' \| grep -v '\.test\.ts' \| wc -l` |
| Files with `new RegExp` (excl. tests) | 27 | `grep -rln 'new RegExp' src --include='*.ts' \| grep -v '\.test\.ts' \| wc -l` |
| Duplicate `escapeRegExp` definitions | 5 (1 canonical + 5 dupes; 3 escape-body variants) | `grep -rn 'function escapeRegE\?xp' src --include='*.ts' \| grep -v '\.test\.ts'` |
| Divergent escape body (missing `*`) | 1 | `architecture-drift.ts:174` — `/[|\\{}()[\]^$+?.]/gu` |
| Files modified by this blueprint (est.) | 6 | modify: 6 (no new files) |

## Refinement Summary

### Corrections from original draft (this refinement)
- **F4 / Task 1.1 downgraded HIGH → LOW (false alarm).** `src/ai-tools/search-files.ts:186-188` builds `const regex = new RegExp(pattern, ...); void regex` *only to validate the pattern's syntax*, then immediately discards it. Actual matching is delegated to `context.storage.searchFiles(pattern, ...)` (line 81) outside this repo. The constructed `RegExp` is never executed against any string → there is **no ReDoS surface**. The tool's documented contract is regex search (`inputSchema` line 138, "supports regex"); escaping `pattern` would turn `import.*from` into a literal search and break the feature. Task 1.1 was deleted; the only safe residual change is an optional length cap on the *syntax-validation* call.
- **Removed `escapeRegex` prescriptions that break intentional regex/glob.** `package-surface.ts:1032-1036` (`parseSlashRegex`) deliberately interprets `/source/flags` user config **as a regex** (`return new RegExp(source, flags)`). `validate-command.ts:109` deliberately compiles a user/config glob. Calling `escapeRegex` on those inputs escapes the user's metacharacters into literals and silently breaks matching for zero security gain. Both prescriptions were dropped; at most these get a length bound, not escaping.
- **Deleted the speculative `src/utils/safe-regexp.ts` builders.** With Task 1.1 gone and the migration prescriptions removed, no real consumer survives for `safeRegExpFromGlob` / `safeBuildRegex`. There is also **no `#utils/*` alias** — `#utils/*` already maps to `./src/blueprint/utils/*.ts` (verified in `package.json`), so a new `src/utils/` tree would be misplaced. If a shared glob helper is ever needed it should be colocated at `src/blueprint/utils/string.ts`.
- **Fixed the false "all 6 copies identical — verified" risk row.** The copies are **not** byte-identical. There are **3 escape-body variants**:
  - `/g` flag, full set `/[.*+?^${}()|[\]\\]/g` — canonical `string.ts:8`, `package-surface.ts:1078`, `forbidden-commands.ts:152`.
  - `/gu` flag, full set `/[.*+?^${}()|[\]\\]/gu` — `internal-subpath-imports.ts:21`, `package-scripts.ts:73`.
  - **divergent**: `/[|\\{}()[\]^$+?.]/gu` — `architecture-drift.ts:174`, **missing `*`**. This is a real behavior delta and the reason consolidation has a product-wedge.
- **Corrected counts.** Files with `new RegExp` (excl. tests): **27** (draft said 23). "6 copies" reworded to **1 canonical + 5 duplicates**.

### Corrections from original draft (prior pass, retained)
- **Count**: Original claimed 17 sites; `grep` shows **50**.
- **secret-provider-quarantine.ts:25**: Not a risk — uses `String.raw` constants via `parts.join('')` to avoid self-triggering its own audit. The mechanism is dynamic but all content is literal strings. Tagged LOW.
- **validate-command.ts:109**: Pattern comes from `IGNORE_PATTERNS` (hardcoded constants) / config glob, not free-form user input. Not escaped (intentional glob). LOW.
- **`escapeRegex` already exists**: `src/blueprint/utils/string.ts:7` exports a canonical `escapeRegex`. Five other files have private copies. Task 1.1 (was 1.2) is **consolidation** not creation.

### Re-scoped tasks
1. Consolidation (Task 1.1) is now the headline task — it has the only product-wedge (the `architecture-drift` `*` bug).
2. The HIGH "harden search-files" task was deleted; a residual length-cap-only task (1.2) remains, with no escaping.
3. The speculative `safe-regexp.ts` builder task and the broad migration task were dropped (no surviving consumer).

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | LOW | 17 `new RegExp(...)` sites use non-literal arguments. | **50** sites total across **27** files. Most are safe (constants, `String.raw`, source reuse, internal-only). |
| F2 | LOW | `src/audit/secret-provider-quarantine.ts:25` uses `parts.join('')`. | Confirmed — but all parts are `String.raw` literals. Safe anti-self-trigger pattern. |
| F3 | LOW | `src/config/docs-lint/cli/commands/validate-command.ts:109` does glob-to-regex. | Confirmed — `pattern` is an intentional config glob. Do **not** escape it; escaping would break glob matching. At most add a length bound. |
| F4 | ~~HIGH~~ **LOW** | `src/ai-tools/search-files.ts:187` passes raw user regex. | **False alarm.** Line 186-188 builds `const regex = new RegExp(pattern, ...); void regex` purely to validate syntax, then discards it; matching is delegated to `context.storage.searchFiles` (line 81). No execution → no ReDoS. Documented contract is regex search; escaping would break the feature. Residual: optional length cap on the validation only. |
| F5 | LOW | `src/mcp/blueprint-server.ts:1099` interpolates `task_id`, escapes only dots. | Confirmed. `task_id` is a controlled blueprint identifier; the only metacharacter that realistically appears is `.`, which is already escaped. Not in scope for this S blueprint (no behavior change needed); noted for future hardening if `task_id` grammar widens. |
| F6 | LOW | `src/audit/package-surface.ts:1033` (`parseSlashRegex`) parses slash-delimited regex. | Confirmed — and it is **intentional**: the user wrote `/source/flags` config to be used *as a regex*. Do **not** escape `source`; that would break every config-supplied pattern. Existing `try/catch` handles invalid input; at most add a length bound. |

## Tasks

#### [regex] Task 1.1: Consolidate duplicate `escapeRegExp` helpers onto canonical `escapeRegex` [Complexity: S]

**Status:** todo
**Depends:** None

Replace the 5 private `escapeRegExp` copies with imports of the canonical `escapeRegex` from `src/blueprint/utils/string.ts`. This is **not** a pure relocation: `architecture-drift.ts:174` uses a divergent char class missing `*`, so consolidating it onto the canonical helper is a behavior fix (it will now escape `*`). The two `/gu`-flagged copies (`internal-subpath-imports.ts`, `package-scripts.ts`) collapse to the `/g` canonical — verify `/gu`→`/g` neutrality (the Unicode flag changes nothing for this ASCII-only metacharacter class, but confirm via the existing tests).

**Files:**
- Modify: `src/blueprint/utils/string.ts` (export an `escapeRegExp` alias of `escapeRegex` if call sites prefer that name; keep one implementation)
- Modify: `src/config/internal-subpath-imports.ts` (remove private copy at line 20, import canonical)
- Modify: `src/cli/package-scripts.ts` (remove private copy at line 72, import canonical)
- Modify: `src/audit/architecture-drift.ts` (remove divergent copy at line 173 — **fixes the missing-`*` bug**, import canonical)
- Modify: `src/audit/package-surface.ts` (remove private copy at line 1077, import canonical)
- Modify: `src/hooks/pretool-guard/validators/forbidden-commands.ts` (remove private copy at line 151, import canonical)

**Steps (TDD):**
1. Confirm `src/blueprint/utils/string.ts` exports `escapeRegex` (and optionally an `escapeRegExp` alias) using `/[.*+?^${}()|[\]\\]/g`.
2. Replace all 5 private copies with imports from `src/blueprint/utils/string.ts` (use `#*` subpath imports, not `../` ladders).
3. For `architecture-drift.ts`: confirm via test that switching from the `*`-less char class to the canonical one is the intended fix (an identifier containing `*` must now be escaped). Add/adjust a test asserting `escapeRegex('a*b')` produces `a\*b`.
4. For `internal-subpath-imports.ts` and `package-scripts.ts`: verify the `/gu`→`/g` change is neutral against existing tests (ASCII-only class).
5. Run `vp run test` for each touched module + `vp run lint` + `vp run typecheck`.

**Acceptance:**
- [ ] Only one `escapeRegex` implementation in `src/` (alias `escapeRegExp` may point at it).
- [ ] All 5 former call sites import from `src/blueprint/utils/string.ts` via `#*` subpath.
- [ ] `architecture-drift.ts` now escapes `*` (test asserts `a*b` → `a\*b`).
- [ ] `vp run test` passes (no regressions); `wp audit architecture-drift` and `wp audit package-surface` still pass.

---

#### [security] Task 1.2: Length-bound the `search-files.ts` syntax-validation [Complexity: XS]

**Status:** todo
**Depends:** None

The regex built at `search-files.ts:186-188` is `void`'d (never executed) and matching is delegated to `context.storage.searchFiles`, so there is **no ReDoS surface here** and the pattern must **not** be escaped (escaping would break the documented regex-search contract). The only defensible residual change is a cheap length bound so a pathologically long pattern is rejected with a clear error before compilation, consistent with input-validation hygiene.

**Files:**
- Modify: `src/ai-tools/search-files.ts`

**Steps (TDD):**
1. Read `src/ai-tools/search-files.ts:180-195` to confirm the validate-then-discard shape and the `Invalid regex pattern` error path.
2. Before the `new RegExp(pattern, ...)` validation, add a length guard (e.g. reject `pattern.length > 4096`) returning the existing failure-shaped result (`success: false`, descriptive `error`).
3. Do **not** call `escapeRegex` on `pattern` — the tool contract is regex search.
4. Add a test for the over-length rejection path; verify existing syntax-validation tests still pass.
5. `vp run lint` + `vp run typecheck`.

**Acceptance:**
- [ ] Over-length patterns are rejected with the existing failure shape; valid regex search still works unchanged.
- [ ] `pattern` is NOT escaped (regex-search contract preserved).
- [ ] `vp run test --file src/ai-tools/search-files.test.ts` passes.

---

#### [regex] Task 1.3: Document remaining dynamic sites as intentional / out-of-scope [Complexity: XS]

**Status:** todo
**Depends:** None

Several remaining dynamic `new RegExp` sites take *intentional* user/config regex or glob and must not be escaped. Add brief code comments (or a short note in the relevant module doc) recording that these are deliberate, so a future audit pass does not re-flag them.

**Files:**
- Modify: `src/audit/package-surface.ts` (`parseSlashRegex` at ~1033 — note: user config `/source/flags` is intentional regex; do not escape)
- Modify: `src/config/docs-lint/cli/commands/validate-command.ts` (line 109 — note: intentional config glob; do not escape)
- Modify: `src/config/oxlint/graphql-conventions.ts` (note: `singular` is internal-only, safe)

**Steps (TDD):**
1. For each file, read the surrounding context to confirm the input is intentional regex/glob, not free-form untrusted text.
2. Add a one-line comment at each site marking it intentional (and, for `parseSlashRegex`, that the existing `try/catch` is the validation seam; optionally add a length bound only).
3. Do **not** change matching semantics anywhere in this task.
4. `vp run lint` + `vp run typecheck`.

**Acceptance:**
- [ ] Each intentional site carries a comment explaining why it is not escaped.
- [ ] No matching-semantics change; `vp run test` passes.
- [ ] GraphQL oxlint rules still fire correctly.

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `vp run typecheck` | Zero errors. |
| Unit tests | `vp run test` | All pass (no regressions). |
| Lint | `vp run lint` on modified files | Zero violations. |
| Audit self-check | `wp audit architecture-drift` | Must pass; `*`-bearing identifiers now escaped correctly. |
| Audit self-check | `wp audit package-surface` | Must still pass (matching semantics unchanged). |
| Audit self-check | `wp audit secrets-policy` | Must still pass (quarantine preserved). |

## Non-goals

- Escaping any intentional user/config regex or glob (`parseSlashRegex`, `validate-command` glob, `search-files` search pattern). Escaping these breaks documented matching behavior for zero security gain.
- Treating `search-files.ts:187` as a ReDoS site — the regex is discarded and never executed.
- Building a new `src/utils/safe-regexp.ts` module — no surviving consumer; `#utils/*` already maps to `src/blueprint/utils/`.
- Rewriting `secret-provider-quarantine.ts:25` anti-self-trigger (it's already safe).
- Refactoring oxlint custom rules beyond documentation.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Consolidating `architecture-drift.ts` changes its escape behavior | This is the **intended** fix (it was missing `*`). Add a test asserting `a*b` → `a\*b`, and re-run `wp audit architecture-drift` to confirm no false negatives/positives. |
| `/gu`→`/g` flag change alters behavior | The metacharacter class is ASCII-only; the Unicode flag is neutral here. Verify against existing tests for `internal-subpath-imports.ts` and `package-scripts.ts`. |
| Length cap on `search-files` rejects a legitimate long pattern | 4096 chars is far beyond any realistic search pattern; the failure path reuses the existing descriptive-error shape. |
| A consolidated call site relied on a subtly different escape body | Verified there are exactly 3 variants (`/g`, `/gu`, and the `*`-less `architecture-drift` body); only `architecture-drift` differs semantically, and that difference is the bug being fixed. |
