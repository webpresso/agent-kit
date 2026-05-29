import { describe, expect, it } from 'vitest'

import { resolveAuditScriptPath } from './resolve-audit-script.js'

describe('resolveAuditScriptPath', () => {
  it('resolves the dev .ts source in src/audit when it exists', () => {
    const resolved = resolveAuditScriptPath('audit-tph.ts', {
      moduleUrl: 'file:///repo/src/cli/commands/audit.js',
      exists: () => true,
    })
    expect(resolved).toBe('/repo/src/audit/audit-tph.ts')
  })

  it('falls back to the compiled dist .js when the .ts is absent (published layout)', () => {
    // The npm tarball ships only dist/ — no src/, no .ts. The resolver must
    // point bun at the compiled sibling that actually exists in dist/esm/audit.
    const resolved = resolveAuditScriptPath('audit-tph.ts', {
      moduleUrl: 'file:///pkg/dist/esm/cli/commands/audit.js',
      exists: (url) => url.pathname.endsWith('.js'),
    })
    expect(resolved).toBe('/pkg/dist/esm/audit/audit-tph.js')
    // Regression guard: never the nonexistent <bundle>/src/audit/*.ts path the
    // old CLI resolver produced (dist/esm/cli/src/audit/audit-tph.ts).
    expect(resolved).not.toContain('/cli/src/audit/')
  })

  it('resolves audit-tph-e2e from the mcp module location in the published layout', () => {
    const resolved = resolveAuditScriptPath('audit-tph-e2e.ts', {
      moduleUrl: 'file:///pkg/dist/esm/mcp/tools/audit.js',
      exists: (url) => url.pathname.endsWith('.js'),
    })
    expect(resolved).toBe('/pkg/dist/esm/audit/audit-tph-e2e.js')
  })
})
