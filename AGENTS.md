<!--
  AGENTS.md template.

  Current-state agent-kit scaffolding (`wp setup`) renders this file with:
  - Repository map: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - Tech stack: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - Escalation map: user-edited section. Left as a TODO placeholder if
    not specified.
  - Durable planning root: defaults to `.agent/planning/`. Override via
    .webpressorc.json.
  - Blueprints directory: defaults to `blueprints`. Override via
    .webpressorc.json#blueprintsDir.

  Managed sections in this file are refreshed by agent-kit. Sync uses `wp sync`.
  Repo-specific edits belong only inside `user-owned` blocks; agent-kit preserves
  those blocks verbatim when it rewrites managed content.
-->

<!-- >>> managed by webpresso (operating-contract) -->
# Operating Contract

Prefer repo-local instructions when they are more specific than this template.
Keep changes small, reviewable, and verified.

## Setup after clone

```bash
vp install && vp run setup:agent  # setup:agent runs wp setup, which scaffolds .agent/, AGENTS.md, hooks, and runs wp sync
```

agent-kit's catalog is the single source of truth for generated agent surfaces.
Agent-kit owns the generated agent surfaces in this file; the Webpresso CLI host owns the end-user command surface.

Defaults worth preserving:
- External tools such as `omx`, `omc`, and `gstack` are self-installed and updated with their native installers when you choose to use them.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Track repo-owned instruction sources (`AGENTS.md`, `agent-rules/`, `agent-skills/`).
- Ignore generated/runtime surfaces (`.agent/`, `.agents/`, `.omx/`, `.codex/`, `.claude/skills/`, etc.).

Current-state bootstrap commands remain `wp setup` / `wp sync`; future unified CLI replacements are `webpresso agent setup` / `webpresso agent sync`.

Prompt budget contract:
- Keep the generated default `AGENTS.md` under 8 KB.
- Move handbook prose to docs; keep only durable rules and command contracts here.

Codex routing instruction surface:
<wp_instruction_surface host="codex" artifact="AGENTS.md" source="wp_routing">
  <host_contract>
    <native_tool_names>wp_session_restore, wp_session_search, wp_session_execute_file, wp_session_execute, wp_session_batch_execute, wp_session_fetch_and_index, wp_session_index, wp_session_capture, wp_session_snapshot, wp_session_stats, wp_session_doctor, wp_session_purge, wp_test, wp_e2e, wp_lint, wp_typecheck, wp_qa, wp_audit, wp_ci_act, wp_worker_tail</native_tool_names>
    <stdout_noop>Codex hook commands with no action write {} on stdout; durable guidance belongs in AGENTS.md.</stdout_noop>
    <lifecycle_notes>
    <note>Codex reads repository instruction files for durable guidance.</note>
    <note>Unsupported managed lifecycle names are documented in the host capability matrix, not emulated here.</note>
    </lifecycle_notes>
    <public_support>Public support: first-class Codex instruction artifact.</public_support>
  </host_contract>
</wp_instruction_surface>

## Plan

Use blueprints for non-trivial work. Specs live in
[`blueprints/`](./blueprints/) with lifecycle directories such as
`planned/`, `in-progress/`, and `completed/`. Keep tasks, dependencies,
verification commands, and acceptance criteria current before execution.
PRs with any non-`*.md` changes must include a changed blueprint, unless a
commit carries `Blueprint-exempt: <reason>` for a genuinely trivial exception.

Catalog-owned surfaces:
- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Prefer repo scripts/wrappers over ad-hoc commands.
- Reuse nearby utilities and patterns before adding new abstractions.
- Apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.

## Verify

Before claiming completion, run the narrowest checks that prove the change:
- agent-kit MCP tools first when available; otherwise the repo wrapper
- typecheck
- lint / format check
- affected tests
- repo policy checks such as `verify:paths` / `verify:secrets`
- docs or blueprint validation when docs/plans changed
- `wp sync --check` after template/catalog changes

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Explain why the change exists, what tradeoffs were made, and what was verified.
Record durable architecture decisions in the repo's ADR/planning surface if one exists.
<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->
## Repo-specific customizations

- Global Codex hook commands must be **path-stable**: do not rely on bare
  `node` or other PATH-resolved binaries in generated hook
  runtime surfaces. Repair this in setup/scaffolders, not by hand-editing
  `~/.codex/hooks.json`.
- Blueprint/MCP discovery paths must be **bounded and degradable**: roots
  fetches, git probes, and project discovery should return partial results +
  warnings when slow, never hang the transport.
- Discovery-specific timeout policy for MCP/blueprint tools is non-negotiable:
  partial results + warning fields are preferred to raising global tool
  timeouts or adding retry/backoff loops.
- Timeout failures are diagnostics, not fixes. Do not raise timeouts to make
  hook or MCP hangs disappear; follow `.agent/rules/no-timeout-as-fix.md`.
- Keep these repo-local expectations aligned with `.agent/rules/agent-guide.md`
  and the active blueprint tasks before changing hook or MCP runtime behavior.
- **Agent tool: never use `subagent_type=Explore` for multi-step or synthesis tasks.**
  Explore reads excerpts only; complex tasks cause it to emit a meta-comment
  (`"Final summary delivered above."`) as its final text instead of actual content —
  the parent receives that string as the entire result. This is a known failure mode,
  not intermittent. Apply these routing rules instead:
  - Codebase research → `ctx_batch_execute` (auto-indexes, returns inline matches,
    no subagent overhead, never drops output).
  - Synthesis tasks or multi-part lookups → `Agent({ subagent_type: "general-purpose" })`.
  - Explore is acceptable **only** for a single targeted file/symbol lookup; always
    include search breadth ("quick" | "medium" | "very thorough") in the prompt.
<!-- <<< user-owned (repo-customizations) -->

<!-- >>> managed by webpresso (planning-and-release) -->
## Safety boundaries

- Do not commit secrets or credentials.
- Do not create or persist secret-bearing files like `.env`, `.env.local`, `.env.*.local`, `.dev.vars`, or `.dev.vars.example`.
- Route secret-scoped commands through the repo contract (`wp secrets doctor --profile <profile> --json` + `wp secrets run --sink <sink> --profile <profile> -- <cmd>`).
- Keep secret/path checks on shared audit surfaces when available.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.cursor/`, `.omx/`, `.omc/`, `.codex/`, `.opencode/`).
- Do not hand-edit generated or derived surfaces; edit the catalog in agent-kit.
- Do not push directly to `main`; use PRs and keep CI green.
- Do not bypass hooks or verification gates.
- Treat publishable tarballs as public disclosure surfaces.
- Surface conflicts between this file and deeper repo instructions instead of silently ignoring either.

## Durable planning surface

- Materialized by setup: blueprint lifecycle directories under `blueprints/`.
- Put blueprint-owned PRDs and test specs under `blueprints/`, next to the blueprint they refine.
- Generated on demand (not created by setup): boundary contracts at `.agent/planning/contracts/`, lifecycle state at `.agent/planning/state/`, session notes at `.agent/planning/notepad.md`, and project memory at `.agent/planning/project-memory.json`.

If work changes workspace ownership, build boundaries, or cross-package consumption mode, update the relevant boundary contract before claiming the plan is ready.

## Releases

All webpresso public packages use **Changesets**. Never push `v*` tags or manually bump `package.json#version`.

Release flow:
1. `vp run changeset`
2. Commit the generated `.changeset/*.md`
3. Merge to `main` to update the **Version Packages** PR
4. Merge that PR to publish

```bash
vp run changeset:status
```

Full protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `vp` as the command facade (`vp install`, `vp run <script>`).
- All packages: `"type": "module"`, public npm `publishConfig`.
- Auth: use npm trusted publishing/OIDC only; do not use `NPM_TOKEN` / `NODE_AUTH_TOKEN` publish fallbacks.

Full details: `.agent/rules/package-conventions.md`

## Repository map

- `@webpresso/agent-config` — `packages/agent-config`
- `@webpresso/agent-kit` — `.`

## Tech stack

- TypeScript
- Vitest
- Zod
<!-- <<< managed by webpresso (planning-and-release) -->

<!-- >>> user-owned (escalation-map) -->
## Escalation map

{{TODO: populate escalation map — who to ping for which subsystem.}}
<!-- <<< user-owned (escalation-map) -->
