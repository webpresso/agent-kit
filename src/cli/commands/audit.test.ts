import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { resolveGuardrailAuditKinds } from './audit.js'

const tempDirs: string[] = []

function makeRoot(packageName: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wp-audit-guardrails-'))
  tempDirs.push(root)
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: packageName }), 'utf8')
  return root
}

describe('resolveGuardrailAuditKinds', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('does not run agent-kit MCP AI contracts against ordinary consumer repos', () => {
    const root = makeRoot('monorepo')

    expect(resolveGuardrailAuditKinds(root)).not.toContain('ai-contracts')
    expect(resolveGuardrailAuditKinds(root)).toContain('architecture-drift')
    expect(resolveGuardrailAuditKinds(root)).toContain('no-first-party-mjs')
  })

  test('keeps AI contract guardrails active for agent-kit', () => {
    const root = makeRoot('@webpresso/agent-kit')

    expect(resolveGuardrailAuditKinds(root)).toContain('ai-contracts')
    expect(resolveGuardrailAuditKinds(root)).toContain('architecture-drift')
    expect(resolveGuardrailAuditKinds(root)).toContain('no-first-party-mjs')
  })

  test('keeps AI contract guardrails active for repos that own the MCP helper surface', () => {
    const root = makeRoot('custom-agent-kit')
    const helper = path.join(root, 'src/mcp/tools/_shared/result.ts')
    mkdirSync(path.dirname(helper), { recursive: true })
    writeFileSync(helper, 'export {}', 'utf8')

    expect(resolveGuardrailAuditKinds(root)).toContain('ai-contracts')
  })
})
