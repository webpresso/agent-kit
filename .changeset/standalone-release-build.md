---
"@webpresso/agent-kit": patch
---

fix(release): build and install `@webpresso/agent-kit` from a standalone checkout

Release builds previously depended on the unpublished `@webpresso/cli-contract`
workspace package, so a packed tarball could not be built or installed outside
the source workspace. The small CLI bundle contract types are now inlined into
`src/cli/bundle/contract.ts`, and the `@webpresso/cli-contract` dependency was
removed from `package.json`, `pnpm-workspace.yaml`, and the lockfile. The Vite
Plus install contract was hardcut to match, and the stale
`.github/actions/checkout-cli-contract` composite action plus its workflow
invocations were removed so CI no longer clones the unpublished workspace. A
bundle-independence guard scans `src/cli/bundle/**/*.ts`, `package.json`, and
`pnpm-workspace.yaml` to prevent the workspace-only contract package from being
reintroduced.
