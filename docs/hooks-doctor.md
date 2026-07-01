---
type: guide
last_updated: 2026-07-01
---

# wp hooks doctor

`wp hooks doctor` is the canonical post-setup operator success check. It performs a 3-way comparison:

1. What `wp setup` wrote (the hooks manifest at `.webpresso/hooks-manifest.json`)
2. What is actually installed (`.claude/settings.json`, `.codex/hooks.json`)
3. What `wp` currently expects from the canonical hook specs

It also reports packaged host artifacts (`.claude-plugin/`, `.codex-plugin/`),
active hook ownership, and host lifecycle depth. Claude and Codex report full coverage for replacement-critical managed lifecycle
events emitted by `wp setup`; Cursor/OpenCode degraded coverage is reported as a
documented boundary, not as a repairable failure.

It also reports the public precedence model:

- **MCP first** — use `wp_*` tools when the host can see them
- **Direct `wp` fallback only** — use `wp ...` when MCP is unavailable
- **No wrappers** — do not use `bun run wp`, `pnpm run wp`, `npm run wp`, `yarn wp`, or `vp run wp`

## Verdicts

| Verdict   | Meaning                                           | Resolution                               |
| --------- | ------------------------------------------------- | ---------------------------------------- |
| `ok`      | Hook matches manifest and current spec            | Nothing to do                            |
| `missing` | Hook in manifest but absent from installed config | Re-run the printed setup/restore command |
| `unknown` | Hook in installed config but not in manifest      | Run `wp hooks status` to investigate     |

## Running

```bash
wp hooks doctor
```

After a fresh `wp setup`, the success path is:

```bash
wp hooks doctor
```

Then in Claude or Codex, run the same read-only proof command:

```text
wp_audit(kind="docs-frontmatter")
```

With `--vendor` flag to check one vendor:

```bash
wp hooks doctor --vendor codex
```

Semantic decision probe — fires the smallest allow/deny conformance rows at the
real `pretool-guard` and asserts the routing decision (a legitimate `gh pr
merge` is allowed; a `gh pr view` is denied):

```bash
wp hooks doctor --probe-decisions
```

The default run stays cheap (empty-stdin liveness only). `--probe-decisions` is
operator-side confirmation; CI already enforces the same decisions through the
conformance-matrix boundary suite, so a green doctor and green CI agree.

Each hook probe (liveness and `--probe-decisions`) is bounded so a hung hook bin
can't stall `doctor`. The deadline defaults to **5000ms**; on slow CI runners
raise it with `WP_DOCTOR_HOOK_TIMEOUT_MS` (milliseconds), e.g.
`WP_DOCTOR_HOOK_TIMEOUT_MS=15000 wp hooks doctor`. A probe that exceeds the
deadline reports `… timed out after <ms>ms` and the process tree is killed.

Attempt the safe auto-repair lane:

```bash
wp hooks doctor --fix
```

`--fix` is intentionally honest:

- **`fixed`** — doctor applied the safe manifest-backed restore path or found nothing to change
- **`prepared`** — a safe restore path exists, but doctor is only describing it
- **`requires-approval`** — a broader `wp setup` run would be needed, so doctor refuses to do it automatically
- **`blocked`** — installed hook config appears hand-edited or otherwise unsafe to overwrite automatically

## Common scenarios

### All hooks show `missing`

The hooks were never installed or the config was reset. Re-run:

```bash
wp setup
```

In the agent-kit source repo, use the source-aware form:

```bash
WP_FORCE_SOURCE=1 wp setup repair
```

If a manifest already exists, `wp hooks doctor --fix` can use the narrower
restore path:

```bash
wp setup repair --restore-hooks
# source repo:
WP_FORCE_SOURCE=1 wp setup repair --restore-hooks
```

### Codex hooks show `pending-trust`

This is normal after first install. Re-run `wp setup` so webpresso can sync trust metadata. If Codex still reports pending trust, review the installed hooks in Codex with `/hooks` and approve the exact generated entries shown there.

### Some hooks show `unknown`

Hooks were added to the config outside of `wp setup`. These are safe but untracked.
Run `wp hooks status` first. `wp hooks doctor --fix` intentionally refuses to
overwrite these hand-edited/untracked entries automatically and prints the
preserved files it left untouched.

### Manifest absent

If `.webpresso/hooks-manifest.json` is missing, doctor treats all installed hooks as `unknown`.
Re-run the exact command printed by doctor/status to regenerate the manifest. `wp hooks doctor --fix` reports
this as `requires-approval` instead of silently running the broader setup flow
for you.

## Reliability guardrails

Recent hook-reliability work made doctor/status the operator-facing place to
check these invariants:

- `--probe-decisions` runs semantic allow/deny rows against the real
  `pretool-guard`; the same boundary is also covered by CI conformance tests.
- `WP_DOCTOR_HOOK_TIMEOUT_MS` is a diagnostic escape hatch only. Prefer fixing
  slow or hung hooks over raising timeouts.
- Hooks invoked outside a git repo degrade with a clear diagnostic instead of
  throwing or widening discovery into parent directories.
- Worktree-discipline checks honor the effective cwd from `cd` and `git -C`, so
  a legitimate command in an agent worktree is judged against that worktree.
- Legacy managed wrapper files are migrated or reported by setup/doctor rather
  than preserved as silent alternate launch paths.
- Source-repo hook self-hosting is JIT-first: generated launchers should resolve
  the checked-out source package explicitly instead of depending on a stale
  globally installed copy.

The scheduled hook-contract drift workflow remains an early-warning job, not a
required PR check, because it depends on live upstream host schemas.

## Session-continuity release gate

Before shipping hook-bin, typed continuity events, operator docs, or packaged
artifact changes, run the bounded release gate from the repo root:

```bash
WP_FORCE_SOURCE=1 ./bin/wp hooks status --vendor codex
WP_FORCE_SOURCE=1 ./bin/wp hooks doctor --skip-mcp
./bin/wp audit blueprint-lifecycle
./bin/wp audit reference-parity-matrix --json
./bin/wp audit package-surface
npm pack --dry-run --json
vp run lint:pkg
vp run verify:secrets
./bin/wp audit secrets-policy
./bin/wp audit no-dev-vars
./bin/wp audit secret-provider-quarantine
./bin/wp audit secrets-config
vp run verify:paths
```

The `reference-parity-matrix --json` gate validates matrix shape and exposes `releaseClaimGateReady`; run `./bin/wp audit reference-parity-matrix --strict` only when promoting public replacement-parity claims, because it intentionally fails until the live measured benchmark row is full/passed.

Use `--skip-mcp` for release proof when MCP visibility is separately covered by
tool-surface smoke tests. The doctor row must agree with the hook matrix: SessionStart restore plus typed
continuity-event capture are installed for supported managed lifecycle hooks, active
hooks are owned by setup-generated host config, and Cursor/OpenCode degraded
lifecycle depth must remain explicit.

Package-safety proof matters for docs too. Public examples must avoid secrets,
machine-local absolute paths, private runtime state, and unpublished strategy
notes. `npm pack --dry-run --json`, `vp run lint:pkg`,
`./bin/wp audit package-surface`, `./bin/wp audit reference-parity-matrix --json`,
`vp run verify:secrets`, the four `wp audit secret*`/`no-dev-vars` gates, and
`vp run verify:paths` are prerequisites for hook-bin or public docs release
claims.

## session-memory enforcement repair

`wp hooks doctor` verifies that managed launchers for SessionStart, PreToolUse,
PostToolUse and PreCompact are
present and executable. If the fail-closed PreToolUse launcher is missing, setup
and doctor guidance point operators back to `wp setup` / `wp hooks doctor --fix`
so raw large-context operations cannot silently bypass `wp_session_*` routing.
