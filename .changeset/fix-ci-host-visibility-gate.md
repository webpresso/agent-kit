---
"@webpresso/agent-kit": patch
---

fix(setup): skip host visibility hard gate in CI environments

`ak setup` was exiting 1 in CI (GitHub Actions, etc.) because the host skill
visibility check unconditionally failed when `verify` and `plan-refine` skills
were not visible — which happens on clean CI runners where `claude` is absent
and `.claude/skills/` symlinks point to sibling repos that aren't checked out.

The visibility check is a developer-workstation concern. The hard gate now
only fires outside CI environments (`CI != true`). In CI, a warning is logged
and setup continues to exit 0.
