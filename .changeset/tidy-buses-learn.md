---
"@webpresso/agent-kit": patch
---

Fix `wp update` outside package roots by falling back to the global refresh path,
and make `wp sync --check` report the correct source-repo bootstrap guidance for
fresh agent-kit worktrees.
