---
"@webpresso/agent-kit": patch
---

Make `wp setup` remove legacy generated agent surfaces from the Git index after repairing the managed `.gitignore` block, preserving the files on disk while keeping generated `.claude` projections untracked.
