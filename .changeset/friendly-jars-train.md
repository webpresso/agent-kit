---
"@webpresso/agent-kit": patch
---

Fix the release workflow so successful Changesets publishes always finalize the
GitHub Release/tag flow from the action's `published` output and upload the full
native runtime binary set.
