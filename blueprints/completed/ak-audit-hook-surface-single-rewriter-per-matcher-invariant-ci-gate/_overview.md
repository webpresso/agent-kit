---
type: blueprint
title: wp audit hook-surface — single-rewriter-per-matcher invariant CI gate
status: completed
complexity: S
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: '2026-05-13'
last_updated: '2026-05-29'
progress: '100% (implemented)'
depends_on: []
tags: [audit, hooks, ci-gate]
---

# wp audit hook-surface — single-rewriter-per-matcher invariant CI gate

**Goal:** Add `wp audit hook-surface` to enforce the Anthropic-documented
single-rewriter-per-matcher invariant for Claude Code hooks.

## Product wedge anchor

- **Stage outcome:** `wp setup` consumers get a CI gate that catches
  non-deterministic `updatedInput` races before they degrade session quality.
  Satisfies the Anthropic hooks doc guidance (May 2026): "Avoid having more
  than one hook modify the same tool's input."
- **Consuming surface:** `wp audit hook-surface` CLI verb + `wp_audit` MCP
  tool (`kind: "hook-surface"`).
- **New user-visible capability:** Running `wp audit hook-surface` flags any
  project that has both RTK and a context-mode rewriter registered on the
  same PreToolUse/Bash matcher — a silent non-determinism bug that previously
  had no automated detection.

## Architecture Overview

```text
~/.claude/settings.json          (user-level hooks)
$PROJECT/.claude/settings.json   (project-level hooks)
        │
        ▼
auditHookSurface()               src/audit/hook-surface.ts
  └─ resolveSettingsPaths()
  └─ readSettingsFile()
  └─ collectRewriters()
  └─ buildViolations()
        │
        ▼
RepoAuditResult  ──►  REPO_AUDIT_REGISTRY["hook-surface"]  ──►  wp audit hook-surface
                  ──►  MCP dispatch case "hook-surface"      ──►  wp_audit(kind="hook-surface")
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Rewriter detection | Hardcoded pattern list | Avoids reading hook internals; `rtk hook claude` and `*.../pretooluse.mjs` are the two known rewriters in the webpresso stack |
| `userSettingsPath` option | Added to `HookSurfaceOptions` | Enables test isolation without `process.env` patching or OS home-dir mocking |
| Fail-open on parse errors | Parse errors surface as `parse-error` violations | Missing or malformed settings never silently pass; the audit fails loudly with the parse reason |

## Quick Reference (Execution Waves)

| Wave       | Tasks | Dependencies | Parallelizable |
| ---------- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1   | None         | 1 agent        |
| **Wave 1** | 1.2   | 1.1          | 1 agent        |

### Phase 1: Implementation [Complexity: S]

#### Task 1.1: Implement hook-surface audit module + tests

**Status:** done

**Depends:** None

Implement `src/audit/hook-surface.ts` with:
- `auditHookSurface(opts?)` — reads user + project settings, classifies hooks
  as rewriters vs validators, returns `HookSurfaceResult {passed, kind, details}`.
- `auditHookSurfaceAsRepoResult(opts?)` — adapter returning `RepoAuditResult`
  for registry integration.

Write `src/audit/hook-surface.test.ts` covering:
- passes when only RTK is on Bash matcher
- passes when only pretool-guard (validator) is on Bash matcher
- passes when rewriters are on different matchers
- fails when RTK + pretooluse.mjs are both on Bash matcher
- fails when two rewriter groups share the same matcher
- parse error handling (malformed JSON, empty file)
- RepoAuditResult adapter shape

**Files:**

- Create: `src/audit/hook-surface.ts`
- Create: `src/audit/hook-surface.test.ts`

**Acceptance:**

- [x] `auditHookSurface` + `auditHookSurfaceAsRepoResult` exported
- [x] All test cases pass
- [x] Lint passes (oxlint)

#### Task 1.2: Wire hook-surface into CLI registry and MCP tool

**Status:** done

**Depends:** Task 1.1

Register `hook-surface` in:
1. `src/cli/commands/audit-core.ts` — add `'hook-surface'` to `AuditKind` union.
2. `src/cli/commands/audit.ts` — add entry to `REPO_AUDIT_REGISTRY`.
3. `src/mcp/tools/audit.ts` — add `'hook-surface'` to `KINDS`, add dispatch case.

**Files:**

- Modify: `src/cli/commands/audit-core.ts`
- Modify: `src/cli/commands/audit.ts`
- Modify: `src/mcp/tools/audit.ts`

**Acceptance:**

- [x] `wp audit hook-surface` dispatches correctly via REPO_AUDIT_REGISTRY
- [x] `wp_audit(kind: "hook-surface")` dispatches via MCP
- [x] Lint passes

---

## Verification Gates

| Gate        | Command                                      | Success Criteria          |
| ----------- | -------------------------------------------- | ------------------------- |
| Lint        | `wp_lint` (scoped to new files)              | Zero violations           |
| Tests       | `wp_test` (scoped to hook-surface.test.ts)   | All 14 tests pass         |
| Type safety | `wp_typecheck`                               | No new errors introduced  |

## Cross-Plan References

| Type     | Blueprint | Relationship |
| -------- | --------- | ------------ |
| Upstream | None      |              |
| Downstream | None    |              |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| settings.json missing | Silent false-negative | Absent file = empty hook map (no error) | 1.1 |
| Malformed JSON | Crash | Try/catch → parse-error violation surfaced | 1.1 |
| Real ~/.claude/settings.json in tests | Test pollution | `userSettingsPath` option overrides home dir | 1.1 |
| Hook group with no matcher field | Incorrect grouping | Defaults to `'*'` wildcard matcher | 1.1 |

## Non-goals

- Scanning plugin manifests for hook registrations (deferred; plugin.json format not yet stable)
- Detecting rewriters dynamically by inspecting hook process output
- Fixing violations automatically

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| New rewriter commands unknown to hardcoded list | False negative | List is documented and extensible; re-run audit after adding new hooks |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| File I/O | `node:fs` readFileSync | Node built-in | Consistent with other audit modules |
| JSON parsing | `JSON.parse` with try/catch | — | Fail-open on bad files |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

