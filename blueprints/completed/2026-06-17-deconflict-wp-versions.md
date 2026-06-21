---
type: blueprint
title: "De-conflict global vs repo-pinned wp versions"
owner: ozby
status: completed
completed_at: '2026-06-21'
complexity: S
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed; tasks verified during plan-refine reconciliation)'
depends_on: []
cross_repo_depends_on: []
tags:
  - cli
  - wp
  - dx
  - guardrail
max_parallel_agents: 1
---

# De-conflict global vs repo-pinned `wp` versions

**Goal:** Resolve the "two `wp` on PATH is confusing" pain **without** abandoning the
documented global-`wp` install contract. Keep global `wp` as the invocation model;
add a version-skew guardrail so a global `wp` whose version differs from the repo's
pinned `@webpresso/agent-kit` is detected and surfaced, not silently used.

## Product wedge anchor

- **Stage outcome:** open-sourcing roadmap — a consumer (`ozby/ingest-lens`,
  `ozby/edge-matte`) running audits/typecheck via `wp` gets deterministic,
  pin-aligned behavior between local and CI.
- **Consuming surface:** `wp` CLI startup (the verb a consumer runs); README +
  routing-block guidance.
- **New user-visible capability:** when the running global `wp` version differs from
  the repo's catalog/lockfile pin, the user sees a clear skew warning instead of
  silent rule drift.

## Why this is separate from the package split

Verified (Codex audit, 2026-06-17): the global-`wp` model is baked into the
documented consumer contract — `src/cli/commands/init/detect-consumer.ts:258`
("Consumers run the global Vite+ `wp` binary"), scaffolders emit bare `wp ...` hook
commands (`src/cli/commands/init/scaffolders/agent-hooks/index.ts:203`),
`src/cli/auto-update/detect-pm.ts:69`. Dropping `preferGlobal` alone does **not**
make bare `wp` resolve repo-local. Decision: keep the contract, add guardrails.
This is independent of [[2026-06-17-extract-agent-config-package]] (different files).

## Tasks

#### [cli] Task 1.1: Version-skew detection + warning

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/cli/auto-update/version-skew.test.ts --file src/hooks/shared/routing-block.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:36:05.514Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code and docs inspection confirmed CLI bootstrap calls version-skew check, README documents global wp alignment, and routing block mentions the skew warning.","kind":"manual","log_excerpt":"src/cli/bootstrap.ts calls checkVersionSkew; src/cli/auto-update/version-skew.ts warns with npm install -g; README and routing-block describe global wp plus local agent-config.","result":"pass","ts":"2026-06-21T15:36:05.514Z"}]
```

**Depends:** None

Emit a warning at `wp` startup when the running global `wp` version differs from the
repo-pinned `@webpresso/agent-kit` (read the consumer's catalog/lockfile pin from the
nearest workspace; compare to the running CLI version; warn on mismatch). **Detection
only — no timeout/retry changes** (`catalog/agent/rules/no-timeout-as-fix.md`). Avoid
false positives when aligned or when no pin is found.
**Files:** add the skew check near `src/cli/auto-update/detect-pm.ts` /
`src/cli/commands/init/detect-consumer.ts`; surface via existing CLI warning path.

**Acceptance:**

- [x] warning fires on a deliberately mismatched global-vs-pin pair
- [x] no false positive when aligned or pin absent
- [x] no timeout/retry changes.
#### [docs] Task 1.2: Document precedence + the warning

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/cli/auto-update/version-skew.test.ts --file src/hooks/shared/routing-block.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:36:05.514Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code and docs inspection confirmed CLI bootstrap calls version-skew check, README documents global wp alignment, and routing block mentions the skew warning.","kind":"manual","log_excerpt":"src/cli/bootstrap.ts calls checkVersionSkew; src/cli/auto-update/version-skew.ts warns with npm install -g; README and routing-block describe global wp plus local agent-config.","result":"pass","ts":"2026-06-21T15:36:05.514Z"}]
```

**Depends:** 1.1

Document the global-vs-repo-pin precedence and the new skew warning in `README.md`
and `src/hooks/shared/routing-block.ts` guidance. Note `preferGlobal` removal is
handled by [[2026-06-17-extract-agent-config-package]] Task 3.1 (avoid double-edit of
`package.json`).

**Acceptance:**

- [x] precedence documented
- [x] routing-block mentions the skew warning.

## Risk

| Risk | Mitigation |
| ---- | ---------- |
| False-positive warnings annoy users | only warn on a real version delta; suppress when pin is unresolved |
| Overlap with extract blueprint on `package.json` | this blueprint does NOT touch `package.json`; `preferGlobal` removal lives in the extract blueprint |
