---
type: tech-debt
status: accepted
severity: medium
category: testing
review_cadence: monthly
last_reviewed: "2026-05-11"
created: "2026-05-11"
linked_blueprints: ["agent-kit-v1-evidence-ledger"]
affected_modules: ["src/runners/codex-exec"]
---

# real-codex nightly smoke CI

## Context

Per `/plan-eng-review` decision B2 (user choice C on 2026-05-11), all
Runner backend tests in v1.0 mock at the `spawnSync` / Agent invocation
boundary. PR CI never invokes a real Codex binary. The trade was
explicit: fast PR CI + mutation-testable Runner code + Stryker stays
clean, at the cost of catching upstream Codex behavior drift only via
some out-of-band signal.

The `pnpm eval` suite (Tasks 4.2 + 5.1-5.4) runs against real
`claude-subagent`, so it provides partial real-subprocess coverage. But
it does NOT cover `codex-exec` because the eval suite uses the default
Runner backend, which is `claude-subagent` inside Claude Code sessions.

Codex's outside-voice pass on 2026-05-11 listed 12 failure modes that
mocks cannot catch for the codex-exec backend:

1. Auth state changes (token expiry, login required)
2. CLI flag drift (new required flag, deprecated flag)
3. JSONL / event schema drift in stdout
4. Approval behavior changes
5. Project trust prompts appearing where they didn't before
6. Hooks / config layering precedence changes
7. Sandbox mount bugs (volumes vanishing mid-run)
8. stdout buffering differences across Codex versions
9. TTY vs non-TTY behavior divergence
10. SIGTERM handling: graceful vs immediate kill
11. Orphaned child processes after parent dies
12. Platform differences: macOS vs Linux vs Windows vs WSL

## Why this is debt, not a feature

First user reports of "agent-kit's codex-exec runner is broken with the
new Codex version" are the worst class of bug to receive: by the time
the report arrives, users have already lost trust. A nightly CI job
running against real Codex catches drift within 24 hours of an upstream
release, before any user is impacted.

## Watch points (review every cadence)

- **codex-exec backend bug reports** filed against agent-kit — every
  report that "mocks would have caught this" is a calibration signal.
- **Codex release cadence** — if upstream ships a major version, the
  nightly smoke needs to be tested against the new version before users
  upgrade.
- **PR CI failure rate** — if PR CI starts catching real-codex bugs
  reactively, the nightly was insufficient and needs tighter coverage.

## Trigger

Implement this item when **any one** of:

- v1.0 alpha exits to v1.0-beta (so PR CI is solid first).
- A user files a P1 bug against `codex-exec` that mocks would have
  caught (i.e., real-subprocess drift bug).
- Codex ships a minor version bump that the agent-kit team needs to
  validate against.

## Action when triggered

1. Add `.github/workflows/codex-nightly-smoke.yml`:
   - Runs once per day on `main`.
   - Installs Codex CLI binary + uses an auth secret stored in repo
     secrets (`CODEX_AUTH_TOKEN`).
   - Runs a deterministic blueprint (the hello-world fixture from
     `src/runners/claude-subagent/__fixtures__/golden-transcript-hello
-blueprint.md`) through `codex-exec` Runner.
   - Asserts: same exit code, same RunnerEvent kinds, no orphan
     processes (via `ps` check after AbortSignal test).
2. Document the secret rotation procedure (every 90 days, per the
   repo's secret-handling policy in `agent-guide.md`).
3. Set alerting: failure of two consecutive nightly runs pages the
   on-call agent-kit maintainer via the standard CI alerting channel.
4. Document the runbook for nightly failure triage in
   `docs/runbooks/codex-nightly-failure.md`.
5. Move this file to `tech-debt/resolved/` with the implementing
   workflow file link.

## Related

- Blueprint testing convention: B2 (mock-at-boundary).
- Outside-voice context: codex-plan-review 2026-05-11, finding
  "Mocking all Codex behavior is too aggressive. Mocks will not catch
  auth state, CLI flag drift, JSONL/event schema drift, approval
  behavior, ..."
- Sibling tech-debt: `h-002-codex-exec-workspace-write-runner-support.md`
  (this nightly is the leading signal for that item's stability trigger).
