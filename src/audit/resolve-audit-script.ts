import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface ResolveAuditScriptDeps {
  /** `import.meta.url` of the calling module (`cli/commands/audit` or `mcp/tools/audit`). */
  moduleUrl: string
  /** Existence probe; defaults to `fs.existsSync`. Injected in tests to model each layout. */
  exists?: (url: URL) => boolean
}

/**
 * Resolve the absolute path of a Bun audit script (`audit-tph.ts`,
 * `audit-tph-e2e.ts`) living in the sibling `audit/` directory two levels up
 * from the caller.
 *
 * `../../audit/` is correct relative to the caller in BOTH layouts:
 *   - dev:       `src/{cli,mcp}/.../audit.ts` → `src/audit/`
 *   - published: `dist/esm/{cli,mcp}/.../audit.js` → `dist/esm/audit/`
 *
 * The npm tarball ships only `dist/` (never `src/`), so the dev `.ts` source is
 * absent there — fall back to the compiled `.js` sibling the build emits. The
 * previous CLI resolver instead hand-rolled a `<bundle>/src/audit/<name>.ts`
 * path that does not exist in dist, which made `bun` fail with
 * "Module not found"; the MCP twin reached for the unshipped `src/audit/` via
 * `resolvePackageAsset` and failed the same way.
 */
export function resolveAuditScriptPath(
  name: string,
  { moduleUrl, exists = existsSync }: ResolveAuditScriptDeps,
): string {
  const sourceUrl = new URL(`../../audit/${name}`, moduleUrl)
  if (exists(sourceUrl)) {
    return fileURLToPath(sourceUrl)
  }
  const compiledUrl = new URL(`../../audit/${name.replace(/\.ts$/, '.js')}`, moduleUrl)
  return fileURLToPath(compiledUrl)
}
