---
"@webpresso/agent-kit": patch
---

`ak audit no-relative-parent-imports` now also skips `template/`
directories. Files under `<pkg>/.../template/<v>/...` become a downstream
customer's source tree when scaffolded — any `../` parent paths in their
tsconfigs reference the scaffolded layout, not the repo layout — so they
should never be reported on the source repo. This unblocks bundle-style
packages (e.g. `packages/cli/bundles/workspace/template/v1/`) where
scaffolded tsconfigs legitimately use relative paths into the customer's
project root.
