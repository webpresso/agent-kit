---
"@webpresso/agent-kit": patch
---

fix: republish with dist/ included in tarball

0.18.6 was published before the build step ran (build pipeline ordering bug
now fixed in release.yml). The tarball contained zero dist files, causing
`Cannot find module '@webpresso/agent-kit/vitest/node'` and similar errors
for any consumer using the compiled subpath exports. This patch forces a
fresh publish with the corrected pipeline so dist/ is included.
