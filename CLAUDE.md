## Plan mode → blueprint (Claude Code)

When a non-trivial plan is approved in plan mode, run the full gate (**worktree → blueprint → draft PR**) **before** calling `ExitPlanMode` or making any `Edit`/`Write` call:

```bash
# 1. isolate: new worktree on a fresh branch, switch into it
# 2. create the blueprint on that branch
wp blueprint new "<concise goal>" --complexity <XS|S|M|L|XL>
# 3. open the PR early
gh pr create --draft
```

Implement on the worktree branch and push commits to the draft PR; never push directly to `main`. Plans evaporate on `/clear` or context compaction; blueprints persist. Skip the gate only for typos, renames, one-line fixes, or doc-only changes. PRs with non-`*.md` changes need a changed blueprint unless a commit carries `Blueprint-exempt: <reason>`. Full rule: `.agent/rules/pre-implementation.md` § Blueprint gate.

## Supported agent CLIs

Source of truth: [`catalog/agent/rules/supported-agent-clis.md`](catalog/agent/rules/supported-agent-clis.md). Plans, benchmarks, and docs MUST honor the tier classification there; do not re-list tiers anywhere. Adding a new CLI requires updating the rule file (gated by `wp audit supported-agent-clis`).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool; when in doubt, invoke it. Routes: product ideas → /office-hours; strategy/scope → /plan-ceo-review; architecture → /plan-eng-review; design → /design-consultation or /plan-design-review; full review → /autoplan; bugs → /investigate; QA → /qa or /qa-only; code review → /review; visual polish → /design-review; ship/deploy/PR → /ship or /land-and-deploy; save/resume → /context-save or /context-restore.
