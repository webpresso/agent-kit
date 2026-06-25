## Plan mode → blueprint (Claude Code)

When a non-trivial plan is approved in plan mode, run the full gate
(**worktree → blueprint → draft PR**) **before** calling `ExitPlanMode` or
making any `Edit`/`Write` call:

```bash
# 1. isolate: new worktree on a fresh branch, switch into it
# 2. create the blueprint on that branch
wp blueprint new "<concise goal>" --complexity <XS|S|M|L|XL>
# 3. open the PR early
gh pr create --draft
```

Implement on the worktree branch and push commits to the draft PR. Never push
directly to `main`. Plans evaporate on `/clear` or context compaction;
blueprints persist. Skip the worktree/blueprint/PR steps only for typos,
renames, one-line fixes, or doc-only changes. PRs with any non-`*.md` changes
must include a changed blueprint, unless a commit carries
`Blueprint-exempt: <reason>` for a genuinely trivial exception.
Full rule: `.agent/rules/pre-implementation.md` § Blueprint gate.

## Supported agent CLIs

Source of truth: [`catalog/agent/rules/supported-agent-clis.md`](catalog/agent/rules/supported-agent-clis.md).
Plans, benchmarks, and docs MUST honor the tier classification defined there.
Do not re-list the tiers anywhere — link to that rule.

Adding a new CLI requires updating the rule file (gated by `wp audit
supported-agent-clis`).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
