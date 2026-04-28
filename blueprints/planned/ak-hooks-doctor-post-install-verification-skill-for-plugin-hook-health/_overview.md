---
type: blueprint
status: planned
complexity: S
created: 2026-04-26
last_updated: 2026-04-28
progress: '0% (0 of 3 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
  - coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit
tags:
  - plugin
  - hooks
  - dx
  - verification
  - context-mode
---

# ak-hooks-doctor: Post-Install Verification Skill for Plugin Hook Health

> **2026-04-28 update:** After the coordinated hook ships, the doctor must also verify: (1) the single coordinated hook process is active (not the old 2-process setup), (2) context-mode MCP server is reachable via `ctx_doctor` tool, (3) the coordinated routing table covers all expected command patterns. Added as Task 2.1 in the coordinated blueprint scope.

Add `ak hooks doctor` CLI command and `/webpresso-agent-kit:hooks-doctor` skill that verifies the plugin installation is healthy: all hook bins exist, are executable, respond correctly to empty stdin, and the MCP server starts and responds. Mirrors context-mode's `/ctx-doctor` pattern — the single most effective way to surface silent plugin failures immediately.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 5. Context-mode's doctor pattern (`npx tsx src/cli.ts doctor`) is cited as the canonical post-install verification in their CI and README.

## Planning Summary

Three tasks: (1) `ak hooks doctor` CLI command checking all hook bins + MCP, (2) wire into `ak` CLI, (3) skill file so Claude can invoke it as a slash command. Task 1.3 has NO dependency on Task 1.2 — it runs in Wave 0 parallel with Task 1.1.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable |
|------|-------|---------------|
| **Wave 0** | 1.1 (doctor logic), 1.3 (skill markdown) | 2 agents |
| **Wave 1** | 1.2 (CLI wiring) | sequential — depends on 1.1 |

## Parallel Metrics

- RW0=2 (2 tasks in Wave 0)
- CPR=3/2=1.5 (3 tasks, 2 waves)
- DD=1/3=0.33 (1 dependency edge among 3 tasks)
- CP=0 (no blocking chain)

## Fact-Check Findings

| # | Claim | Status |
|---|-------|--------|
| F1 | MCP `tools/list` is the correct method for liveness probe | Verified |
| F2 | Executable check (`mode & 0o111`) is platform-specific — Windows ignores file mode bits | Verified — skip executable check on `process.platform === 'win32'` |
| F3 | MCP timeout default is 3s | **Updated to 5s** — 3s is too tight for cold starts; use 5s, overridable via `AK_DOCTOR_MCP_TIMEOUT_MS` |
| F4 | `CLAUDE_PLUGIN_ROOT` is the env var for plugin root resolution | Verified |
| F5 | Skill catalog path is `catalog/skills/hooks-doctor/SKILL.md` | **CRITICAL — WRONG.** Correct path is `catalog/agent/skills/hooks-doctor/SKILL.md` — generate-skills script reads from `catalog/agent/skills/` |
| F6 | Hook bin paths: `post-tool` → `index.js`, `stop` → `index.js` | **WRONG.** `post-tool` bin is `lint-after-edit.js`, `stop` bin is `qa-changed-files.js`. Also `test-quality-check.js` is a flat file at `dist/esm/hooks/test-quality-check.js` (not in a subdirectory) |
| F7 | CLI registration pattern uses commander subcommand groups | Verified |

## Phases

### Phase 1: Doctor command and skill [Complexity: S]

#### [cli] Task 1.1: Implement ak hooks doctor audit logic

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/doctor.ts`
- **Change:** Export `runHooksDoctor(opts?: { skipMcp?: boolean }): Promise<DoctorResult>` where `DoctorResult` is `{ok: boolean, checks: DoctorCheck[]}` and `DoctorCheck` is `{name: string, ok: boolean, detail?: string}`. Checks (in order):
  1. Each hook bin exists at the correct path:
     - `dist/esm/hooks/pretool-guard/index.js`
     - `dist/esm/hooks/post-tool/lint-after-edit.js`
     - `dist/esm/hooks/stop/qa-changed-files.js`
     - `dist/esm/hooks/guard-switch/index.js`
     - `dist/esm/hooks/sessionstart/index.js`
     - `dist/esm/hooks/test-quality-check.js` (flat file, not in subdirectory)
  2. Each bin is executable (mode includes `0o111`) — skip this check on `process.platform === 'win32'`
  3. `echo '{}' | node <bin>` exits 0 with JSON on stdout (tested for pretool-guard, guard-switch, sessionstart; post-tool and stop are fire-and-forget so just check exit 0)
  4. `plugin.json` exists and references only paths that exist on disk
  5. MCP server starts and responds to `tools/list` within 5 seconds (overridable via `AK_DOCTOR_MCP_TIMEOUT_MS` env var). If `isMcpReady()` is true (sentinel from harden-plugin-hooks), skip the cold-spawn and fast-path to pass. MCP check is **soft-fail in CI** — emit warning but do NOT set `ok: false` for MCP check alone.
  - Print results as `[x] check name` / `[ ] check name: detail` lines to stderr. Exit 0 if all pass, exit 1 if any non-MCP check fails.
- **Steps (TDD):**
  1. Write failing tests: all 5 check categories (mock fs/spawn), MCP soft-fail in CI mode, fast-path when `isMcpReady()` is true
  2. Create `src/hooks/doctor.ts` — make tests green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
  5. Manual: `pnpm run build && node dist/esm/cli/cli.js hooks doctor`
- **Verify:** Run `node dist/esm/cli/cli.js hooks doctor` in a healthy install — all checks show `[x]`. Remove a bin and re-run — relevant check shows `[ ]` with detail.
- **Acceptance:** all of the following:
  - [ ] All 5 check categories implemented with correct bin paths (F6)
  - [ ] `post-tool` bin is `lint-after-edit.js`, `stop` bin is `qa-changed-files.js`
  - [ ] `test-quality-check.js` checked as flat file at `dist/esm/hooks/test-quality-check.js`
  - [ ] Executable check skipped on Windows
  - [ ] MCP timeout is 5s, overridable via `AK_DOCTOR_MCP_TIMEOUT_MS`
  - [ ] MCP check is soft-fail (warning only, does not set `ok: false`)
  - [ ] `isMcpReady()` fast-path skips cold-spawn when sentinel present
  - [ ] Exits 0 on full-pass, 1 on any non-MCP failure
  - [ ] Output is `[x]` / `[ ]` format per check
  - [ ] Unit tests for check logic (mock fs/spawn)

#### [cli] Task 1.2: Wire `ak hooks doctor` into the CLI

- [ ] **Status:** todo
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/cli/cli.ts`
- **Change:** Register `hooks` command group. `ak hooks doctor` invokes `runHooksDoctor()` and exits with its exit code. Also wire into CI: add `"hooks:doctor": "node ./dist/esm/cli/cli.js hooks doctor"` and `"hooks:doctor:ci": "node ./dist/esm/cli/cli.js hooks doctor --skip-mcp"` to `package.json` scripts. Do NOT add `hooks:doctor` to `audits:check` — use `hooks:doctor:ci` (with `--skip-mcp`) instead, since MCP is soft-fail in CI.
- **Steps (TDD):**
  1. Write failing test: `ak hooks doctor` command registered in CLI and exits with correct code
  2. Update `src/cli/cli.ts` — make test green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
  5. Manual: `pnpm hooks:doctor` exits 0 in a healthy repo
- **Verify:** `pnpm hooks:doctor` exits 0 in a healthy repo.
- **Acceptance:** all of the following:
  - [ ] `ak hooks doctor` registered in CLI help text
  - [ ] `hooks:doctor` npm script present
  - [ ] `hooks:doctor:ci` npm script present with `--skip-mcp` flag
  - [ ] `audits:check` uses `hooks:doctor:ci` (not `hooks:doctor`)
  - [ ] `pnpm test` green

#### [skill] Task 1.3: Add hooks-doctor slash-command skill

- [ ] **Status:** todo
- **Depends on:** — (independent of Task 1.2)
- **Files:**
  - Create: `catalog/agent/skills/hooks-doctor/SKILL.md`
- **Change:** Skill file that tells Claude to run `ak hooks doctor` and interpret the `[x]` / `[ ]` output. If any check fails, Claude should suggest the fix (e.g. "run `pnpm build`", "reinstall plugin with `claude plugin install agent-kit --scope user`"). Include trigger phrases: "doctor", "verify hooks", "check plugin", "hooks broken", "plugin not working".

  **CRITICAL:** Path must be `catalog/agent/skills/hooks-doctor/SKILL.md` — the generate-skills script reads from `catalog/agent/skills/`, not `catalog/skills/`.
- **Steps (TDD):**
  1. Create `catalog/agent/skills/hooks-doctor/SKILL.md` with correct frontmatter
  2. Run `pnpm build` — verify `skills/` directory includes `hooks-doctor`
  3. Run `ak skills list` — verify `hooks-doctor` appears
- **Verify:** `ak skills list` shows `hooks-doctor`. Invoking `/webpresso-agent-kit:hooks-doctor` in Claude Code runs the audit.
- **Acceptance:** all of the following:
  - [ ] `catalog/agent/skills/hooks-doctor/SKILL.md` present with correct frontmatter (NOT `catalog/skills/`)
  - [ ] `ak skills list` shows `hooks-doctor`
  - [ ] Skill file includes remediation guidance for each failure type
  - [ ] `pnpm build` regenerates `skills/` directory including new skill

## Non-goals

- Does not implement self-healing or auto-reinstall (context-mode's self-heal block is cited as a code smell in the research)
- Does not check Codex `.codex/hooks.json` integration (separate concern)
- Does not replace `ak audit` — this is plugin-health-specific, not repo-health
