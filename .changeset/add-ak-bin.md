---
'@webpresso/agent-kit': patch
---

Register `ak` as a published bin so consumers can run `ak setup`,
`ak audit`, etc. directly from `node_modules/.bin/ak` (and
`pnpm exec ak ...`) without the `bun ./node_modules/@webpresso/agent-kit/src/cli/cli.ts`
workaround.

The package shipped 6 hook bins (`ak-pretool-guard`, `ak-post-tool`,
etc.) but never registered the main `ak` CLI entrypoint. Consumers
hit this when `ak audit agents` demands `scripts.setup:agent === "ak setup"`
literally, but `ak` itself wasn't on PATH — forcing every consumer to
either fail the audit or carry a duplicate bun-driven `setup:agent-kit`
script alongside the canonical `setup:agent`.

`src/cli/cli.ts` already has the `#!/usr/bin/env bun` shebang, so the
fix is one entry: `"ak": "./src/cli/cli.ts"` in the bin map.
