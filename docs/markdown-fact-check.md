---
type: research
last_updated: '2026-06-11'
---

# Markdown fact-check and package references

This is the calm appendix for current-state doc claims.

If you just want to use the product, read:

- [`README.md`](../README.md)
- [`docs/getting-started.md`](./getting-started.md)
- [`docs/is-agent-kit-for-me.md`](./is-agent-kit-for-me.md)

## Current package identity

- Source package in this repo: `@webpresso/agent-kit` `0.30.3`
- Canonical release contract for this repo is `@webpresso/agent-kit`
- Current source/public npm exports use `@webpresso/agent-kit/*`
- `webpresso` (unscoped) is not this repo's canonical runtime package identity; it remains a legacy/dev-link compatibility name where explicitly supported

## Current doc truths

- The happy path is `wp setup`.
- `context-mode` is in the default `wp setup` preset set, and setup skips it in CI or when `WP_SKIP_CONTEXT_MODE=1`.
- `rtk` is in the default `wp setup` preset set, and setup skips it in CI or when `WP_SKIP_RTK=1`.
- The default setup already includes the repo bootstrap.
- Local setup assets resolve from `node_modules/@webpresso/agent-kit`; legacy
  `node_modules/webpresso` dev-link installs are compatibility-only.
- When a repo pins `@webpresso/agent-kit`, setup should be rerun through the
  repo-local CLI (`vp run setup:agent` or `vp exec wp setup`) rather than a
  global `wp` binary.
- Config/library subpaths rely on Node package `exports`.
- Workspace catalog versions come from pnpm catalogs.
- Zod is on v4 in this workspace.

## External package links

Declared versions come from `package.json` plus `pnpm-workspace.yaml`.
Latest versions were checked against the npm registry on 2026-05-27.

| Package | Declared | Latest | Link |
| --- | ---: | ---: | --- |
| [`@vitejs/plugin-react`](https://www.npmjs.com/package/@vitejs/plugin-react) | `^6.0.1` | `6.0.2` | [repo](https://github.com/vitejs/vite-plugin-react) |
| [`@manypkg/find-root`](https://www.npmjs.com/package/@manypkg/find-root) | `^3.1.0` | `3.1.0` | [repo](https://github.com/Thinkmill/manypkg) |
| [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | `^1.29.0` | `1.29.0` | [repo](https://github.com/modelcontextprotocol/typescript-sdk) |
| [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) | `^12.9.0` | `12.10.0` | [repo](https://github.com/WiseLibs/better-sqlite3) |
| [`cac`](https://www.npmjs.com/package/cac) | `^7.0.0` | `7.0.0` | [repo](https://github.com/cacjs/cac) |
| [`env-paths`](https://www.npmjs.com/package/env-paths) | `^4.0.0` | `4.0.0` | [repo](https://github.com/sindresorhus/env-paths) |
| [`glob`](https://www.npmjs.com/package/glob) | `^13.0.6` | `13.0.6` | [repo](https://github.com/isaacs/node-glob) |
| [`gray-matter`](https://www.npmjs.com/package/gray-matter) | `^4.0.3` | `4.0.3` | [repo](https://github.com/jonschlinkert/gray-matter) |
| [`js-yaml`](https://www.npmjs.com/package/js-yaml) | `^4.1.0` | `4.1.1` | [repo](https://github.com/nodeca/js-yaml) |
| [`ora`](https://www.npmjs.com/package/ora) | `^8.2.0` | `9.4.0` | [repo](https://github.com/sindresorhus/ora) |
| [`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) | `^4.1.2` | `4.1.2` | [repo](https://github.com/moxystudio/node-proper-lockfile) |
| [`remark`](https://www.npmjs.com/package/remark) | `^15.0.1` | `15.0.1` | [repo](https://github.com/remarkjs/remark) |
| [`remark-frontmatter`](https://www.npmjs.com/package/remark-frontmatter) | `^5.0.0` | `5.0.0` | [repo](https://github.com/remarkjs/remark-frontmatter) |
| [`remark-validate-links`](https://www.npmjs.com/package/remark-validate-links) | `^13.1.0` | `13.1.0` | [repo](https://github.com/remarkjs/remark-validate-links) |
| [`rulesync`](https://www.npmjs.com/package/rulesync) | `8.15.1` | `8.22.0` | [repo](https://github.com/dyoshikawa/rulesync) |
| [`ts-pattern`](https://www.npmjs.com/package/ts-pattern) | `^5.9.0` | `5.9.0` | [repo](https://github.com/gvergnaud/ts-pattern) |
| [`vite-plus`](https://www.npmjs.com/package/vite-plus) | `^0.1.19` | `0.1.22` | [repo](https://github.com/voidzero-dev/vite-plus) |
| [`yaml`](https://www.npmjs.com/package/yaml) | `^2.8.1` | `2.9.0` | [repo](https://github.com/eemeli/yaml) |
| [`zod`](https://www.npmjs.com/package/zod) | `^4.4.3` | `4.4.3` | [docs](https://zod.dev/v4) |
| [`zod-to-json-schema`](https://www.npmjs.com/package/zod-to-json-schema) | `^3.25.2` | `3.25.2` | [repo](https://github.com/StefanTerdell/zod-to-json-schema) |
| [`@arethetypeswrong/cli`](https://www.npmjs.com/package/@arethetypeswrong/cli) | `^0.18.2` | `0.18.2` | [repo](https://github.com/arethetypeswrong/arethetypeswrong.github.io) |
| [`@changesets/cli`](https://www.npmjs.com/package/@changesets/cli) | `^2.31.0` | `2.31.0` | [repo](https://github.com/changesets/changesets) |
| [`@secretlint/secretlint-rule-preset-recommend`](https://www.npmjs.com/package/@secretlint/secretlint-rule-preset-recommend) | `^13.0.2` | `13.0.2` | [repo](https://github.com/secretlint/secretlint) |
| [`@stryker-mutator/core`](https://www.npmjs.com/package/@stryker-mutator/core) | `^9.6.1` | `9.6.1` | [repo](https://github.com/stryker-mutator/stryker-js) |
| [`@stryker-mutator/typescript-checker`](https://www.npmjs.com/package/@stryker-mutator/typescript-checker) | `^9.6.1` | `9.6.1` | [repo](https://github.com/stryker-mutator/stryker-js) |
| [`@stryker-mutator/vitest-runner`](https://www.npmjs.com/package/@stryker-mutator/vitest-runner) | `^9.6.1` | `9.6.1` | [repo](https://github.com/stryker-mutator/stryker-js) |
| [`@types/better-sqlite3`](https://www.npmjs.com/package/@types/better-sqlite3) | `^7.6.13` | `7.6.13` | [repo](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [`@types/bun`](https://www.npmjs.com/package/@types/bun) | `^1.1.14` | `1.3.14` | [repo](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [`@types/js-yaml`](https://www.npmjs.com/package/@types/js-yaml) | `^4.0.9` | `4.0.9` | [repo](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [`@types/node`](https://www.npmjs.com/package/@types/node) | `^25.6.2` | `25.9.1` | [repo](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| [`husky`](https://www.npmjs.com/package/husky) | `^9.0.0` | `9.1.7` | [repo](https://github.com/typicode/husky) |
| [`oxfmt`](https://www.npmjs.com/package/oxfmt) | `^0.48.0` | `0.52.0` | [repo](https://github.com/oxc-project/oxc) |
| [`oxlint`](https://www.npmjs.com/package/oxlint) | `^1.63.0` | `1.67.0` | [repo](https://github.com/oxc-project/oxc) |
| [`publint`](https://www.npmjs.com/package/publint) | `^0.3.20` | `0.3.21` | [repo](https://github.com/publint/publint) |
| [`secretlint`](https://www.npmjs.com/package/secretlint) | `^13.0.2` | `13.0.2` | [repo](https://github.com/secretlint/secretlint) |
| [`tshy`](https://www.npmjs.com/package/tshy) | `^4.1.2` | `4.1.2` | [repo](https://github.com/isaacs/tshy) |
| [`typescript`](https://www.npmjs.com/package/typescript) | `^6.0.3` | `6.0.3` | [repo](https://github.com/microsoft/TypeScript) |
| [`vite`](https://www.npmjs.com/package/vite) | `^8.0.11` | `8.0.14` | [docs](https://vite.dev/) |
| [`vitest`](https://www.npmjs.com/package/vitest) | `^4.1.5` | `4.1.7` | [docs](https://vitest.dev/) |

## Reference sources

- npm registry package metadata: `https://registry.npmjs.org/<package>`
- npm downloads API: [`rulesync` last-week downloads](https://api.npmjs.org/downloads/point/last-week/rulesync)
- Node.js package subpath exports:
  <https://nodejs.org/docs/latest-v24.x/api/packages.html#subpath-exports>
- pnpm catalogs: <https://pnpm.io/catalogs>
- Zod v4 docs: <https://zod.dev/v4>
- Changesets project: <https://github.com/changesets/changesets>
- MCP TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
