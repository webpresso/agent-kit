---
type: blueprint
status: planned
complexity: S
created: 2026-04-26
last_updated: 2026-04-26
progress: '0% (0 of 3 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
tags:
  - plugin
  - hooks
  - dx
  - verification
---

# ak-hooks-doctor: Post-Install Verification Skill for Plugin Hook Health

Add `ak hooks doctor` CLI command and `/webpresso-agent-kit:hooks-doctor` skill that verifies the plugin installation is healthy: all hook bins exist, are executable, respond correctly to empty stdin, and the MCP server starts and responds. Mirrors context-mode's `/ctx-doctor` pattern — the single most effective way to surface silent plugin failures immediately.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 5. Context-mode's doctor pattern (`npx tsx src/cli.ts doctor`) is cited as the canonical post-install verification in their CI and README.

## Planning Summary

Three tasks: (1) `ak hooks doctor` CLI command checking all hook bins + MCP, (2) wire into `ak` CLI, (3) skill file so Claude can invoke it as a slash command.

## Phases

### Phase 1: Doctor command and skill [Complexity: S]

#### [cli] Task 1.1: Implement ak hooks doctor audit logic

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/doctor.ts`
- **Change:** Export `runHooksDoctor(): Promise<DoctorResult>` where `DoctorResult` is `{ok: boolean, checks: DoctorCheck[]}` and `DoctorCheck` is `{name: string, ok: boolean, detail?: string}`. Checks (in order):
  1. Each hook bin exists at `dist/esm/hooks/{pretool-guard,post-tool,stop,guard-switch,sessionstart,test-quality-check}/index.js` or the equivalent path
  2. Each bin is executable (mode includes `0o111`)
  3. `echo '{}' | node <bin>` exits 0 with JSON on stdout (tested for pretool-guard, guard-switch, sessionstart; post-tool and stop are fire-and-forget so just check exit 0)
  4. `plugin.json` exists and references only paths that exist on disk
  5. MCP server starts and responds to `list_tools` within 3 seconds (spawn `node dist/esm/mcp/cli.js`, send `{"jsonrpc":"2.0","method":"tools/list","id":1}`, parse response)
  - Print results as `[x] check name` / `[ ] check name: detail` lines to stderr. Exit 0 if all pass, exit 1 if any fail.
- **Verify:** Run `node dist/esm/cli/cli.js hooks doctor` in a healthy install — all checks show `[x]`. Remove a bin and re-run — relevant check shows `[ ]` with detail.
- **Acceptance:** all of the following:
  - [ ] All 5 check categories implemented
  - [ ] Exits 0 on full-pass, 1 on any failure
  - [ ] Output is `[x]` / `[ ]` format per check
  - [ ] MCP server check times out cleanly at 3s (no hang)
  - [ ] Unit tests for check logic (mock fs/spawn)

#### [cli] Task 1.2: Wire `ak hooks doctor` into the CLI

- [ ] **Status:** todo
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/cli/cli.ts`
- **Change:** Register `hooks` command group. `ak hooks doctor` invokes `runHooksDoctor()` and exits with its exit code. Also wire into CI: add `"hooks:doctor": "node ./dist/esm/cli/cli.js hooks doctor"` to `package.json` scripts and add it to `audits:check`.
- **Verify:** `pnpm hooks:doctor` exits 0 in a healthy repo.
- **Acceptance:** all of the following:
  - [ ] `ak hooks doctor` registered in CLI help text
  - [ ] `hooks:doctor` npm script present
  - [ ] `audits:check` includes `hooks:doctor`
  - [ ] `pnpm test` green

#### [skill] Task 1.3: Add hooks-doctor slash-command skill

- [ ] **Status:** todo
- **Depends on:** Task 1.2
- **Files:**
  - Create: `catalog/skills/hooks-doctor/SKILL.md`
- **Change:** Skill file that tells Claude to run `ak hooks doctor` and interpret the `[x]` / `[ ]` output. If any check fails, Claude should suggest the fix (e.g. "run `pnpm build`", "reinstall plugin with `claude plugin install agent-kit --scope user`"). Include trigger phrases: "doctor", "verify hooks", "check plugin", "hooks broken", "plugin not working".
- **Verify:** `ak skills list` shows `hooks-doctor`. Invoking `/webpresso-agent-kit:hooks-doctor` in Claude Code runs the audit.
- **Acceptance:** all of the following:
  - [ ] `catalog/skills/hooks-doctor/SKILL.md` present with correct frontmatter
  - [ ] `ak skills list` shows `hooks-doctor`
  - [ ] Skill file includes remediation guidance for each failure type
  - [ ] `pnpm build` regenerates `skills/` directory including new skill

## Non-goals

- Does not implement self-healing or auto-reinstall (context-mode's self-heal block is cited as a code smell in the research)
- Does not check Codex `.codex/hooks.json` integration (separate concern)
- Does not replace `ak audit` — this is plugin-health-specific, not repo-health
