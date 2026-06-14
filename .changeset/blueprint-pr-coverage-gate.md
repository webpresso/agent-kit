---
"@webpresso/agent-kit": patch
---

Add `wp audit blueprint-pr-coverage`, a reusable PR-scoped gate that requires a blueprint change for non-`.md` PRs unless a commit carries an auditable `Blueprint-exempt: <reason>` trailer. Agent-kit CI now runs this gate on pull requests, and bootstrapped agent instructions document the same blueprint coverage rule.
