## Plan mode → blueprint (Claude Code)

When a non-trivial plan is approved in plan mode, create a blueprint
**before** calling `ExitPlanMode` or making any `Edit`/`Write` call:

```bash
wp blueprint new "<concise goal>" --complexity <XS|S|M|L|XL>
```

Plans evaporate on `/clear` or context compaction. Blueprints persist.
Skip local blueprint creation only for typos, renames, one-line fixes, or
doc-only changes. PRs with any non-`*.md` changes must include a changed
blueprint, unless a commit carries `Blueprint-exempt: <reason>` for a genuinely
trivial exception.
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
