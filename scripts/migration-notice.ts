#!/usr/bin/env bun
/**
 * Postinstall migration notice for the deprecated `@webpresso/agent-kit` package.
 *
 * D14: bun TypeScript file (matches scripts/sync-marketplace-version.ts pattern).
 *
 * Behaviour:
 *   - If process.env.CI is set: exit 0 silently (do not pollute CI logs).
 *   - Otherwise: print migration notice to stderr.
 *   - Always exits 0 via try/finally so nothing blocks `npm install`.
 */

try {
  if (!process.env['CI']) {
    process.stderr.write(
      '\n' +
        '@webpresso/agent-kit is deprecated. ' +
        'Run: npm i -g webpresso  ' +
        'See: https://github.com/webpresso/agent-kit/blob/main/MIGRATION.md\n' +
        '\n',
    )
  }
} finally {
  process.exit(0)
}
