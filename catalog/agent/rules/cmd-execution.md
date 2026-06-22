---
type: rule
slug: cmd-execution
title: Command Execution Rules
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
paths: 
  - '**/*'
---

# Command Execution Rules

## BOOKEND Rule: Full QA Runs Exactly Twice

The full QA pipeline (e.g. `wp qa`, `vp run qa`, `bun run qa`) is a
**bookend command** — run it once at the START and once at the END. Never in
between.

```
START:  qa command              → captures baseline (minutes)
MIDDLE: scoped commands only    → fast iteration (seconds each)
END:    qa command              → final verification (minutes)
```

### Scoped Commands (Use These In Between)

Use the narrowest scope that proves your change:

| Concern    | Scoped form                          |
| ---------- | ------------------------------------ |
| Lint       | `lint --file <paths...>` / `--package <name>` / `lint --affected [--branch]` |
| Tests      | `test --file <paths...>` / `--package <name>` / `test --affected [--branch]` |
| Format     | `format --file <paths...>` / `format --affected [--branch]` |
| Typecheck  | `typecheck --package <name>`         |

When this repo exposes the webpresso quality MCP/CLI surface, prefer
`wp_qa`/`wp_lint`/`wp_typecheck`/`wp_test` leaves (or the equivalent wrapped
`wp qa` surface) for local-dev agent runs. Their compact output filters return
summary-first payloads with `failures`, `tier`, `bytes`, and `tokensSaved`, so
agents can reason over the error set without dumping full test/lint logs into
context. Use `wp err <cmd>` only for ad hoc commands that do not yet have a
specific wrapper; it strips non-failure-looking lines and preserves the
subcommand exit code.

**Multi-target:** `--file` and `--package` typically accept multiple
space-separated values. Check your repo's task runner for the exact flag
surface.

**Affected targeting:** `--affected` means the staged `ACMR` set only; stage files first with `git add`, or use `--affected --branch` for the `origin/${GITHUB_BASE_REF:-main}...HEAD` branch diff. `--branch` requires `--affected`. `--affected` is mutually exclusive with explicit `--file` / `--package` targets. When the repo cannot determine an affected set, read/check commands fall back to whole-repo execution with a warning, but write commands such as `format` and `lint --fix` must fail closed rather than surprise-rewrite the whole tree. An empty non-degraded affected set should skip quickly with an explicit notice.

### Log Files

If the repo's task runner saves output to timestamped logs, treat the log file
as the source of truth. Re-reading a log is always cheaper than re-running the
command.

Common conventions:

- One log per command invocation
- QA runs may split into several stage logs (root checks, typecheck, test)
- Log path is displayed after the command completes

Do not assume the newest log alone is the source of truth. Check related
stage logs and confirm progress with file `mtime`/size changes. If logs are
unchanged, verify whether the underlying process is still alive before
treating the run as stalled.

**Critical:** Read the log file after completion. Never re-run to check
results.

**Forbidden:** Never pipe quality commands (e.g., `test | grep`). Piping
breaks auto-logging and hides real output.

## Formatting

Use the `wp_format` MCP tool or `wp format`. Do not present raw
TypeScript/Bun source-entrypoint commands as agent-facing fallbacks; those
belong inside source-level tests only. **Never
invoke `oxfmt` directly without the correct flags** — it requires
`--ignore-path .gitignore` to skip `.prettierignore` (which contains `*` and
silently excludes every file), and the binary lives in `node_modules/.bin`, not a
global install.

If `wp_format` is unavailable, the correct direct invocation is:

```bash
cd <repo-root> && ./node_modules/.bin/oxfmt --write --ignore-path .gitignore
```

## Other Rules

- MCP tools are the primary agent-facing surface when available. If no MCP tool
  exists for the operation, use the repo-owned wrapper command.
- Agent-facing commands should use MCP tools, `wp ...`, or repo scripts through
  `vp run ...`. The raw TypeScript/Bun CLI entrypoint is an implementation
  detail, not an instruction surface for users or agents.
- Package-manager/runtime wrapper chains such as Corepack, `vp exec`/`vp dlx`,
  `npm exec`/`npx`, `yarn exec`/`yarn dlx`, `bun run`, `bunx`, TypeScript
  runtimes, and `pnpm` (fallback only) do not make quality tools or repo source
  entrypoints agent-facing. Use the matching MCP tool such as `wp_test`, `wp_lint`,
  or `wp_e2e`.
- Prefer native package-manager facades first: `wp`, `vp`, and `bun`; use raw `pnpm`
  only as a last-resort compatibility fallback.
- Secret-touching source entrypoints such as CI act runners and local command
  wrappers must go through a secret-aware MCP wrapper or the repo-provided
  `wp secrets run` surface. They should reuse the repo secret-provider gate and
  must not ask agents to call `doppler` or `infisical` directly.

  Use `wp secrets run --sink <sink> --profile <profile> -- <cmd>` for canonical
  secret-touching operations.
- Use the `WP_` environment variable namespace for webpresso CLI behavior. For
  update checks, the opt-out is `WP_SKIP_UPDATE_CHECK=1`.
- The compiled `wp` binary is canonical for consumers, CI, and the installed plugin.
  **`WP_FORCE_SOURCE=1`** forces `wp <cmd>` to run from `src/cli/cli.ts` in the
  agent-kit dev clone (pairs symmetrically with `WP_FORCE_COMPILED_RUNTIME`). It does
  **not** affect the latency-sensitive `wp-*` hook bins (`wp-pretool-guard`,
  `wp-post-tool`, etc.) — those stay on the compiled binary to avoid cold-bun startup
  on every Edit/Write. Iterate on hook code with `bun src/hooks/…` directly.
- Audit commands are `wp audit <kind>` or MCP `wp_audit`; do not invent a
  separate generic agent subcommand namespace.
- Always use the repo-owned command wrappers (`wp`, `vp`, `bun`, `just`, etc.)
  for repo-owned workflows. Do not invoke underlying tools directly when a
  wrapped recipe exists.
- If you are about to run `vitest`, `test`, `lint`, `typecheck`, `build`,
  `qa`, `e2e`, or repo CLIs directly through a package manager, stop and look
  for the wrapped recipe first.
- Prefer the repo's recipe surface over raw package-manager execution when
  the repo expects a wrapped CLI invocation.
- Never pipe quality commands at all — they typically auto-log (and piping
  may be blocked by pretool hooks). Use compact wrappers such as `wp err`
  instead of piping through `grep`/`tail`.
