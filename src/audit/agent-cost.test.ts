import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { auditAgentCost } from './agent-cost.js'

const TMP = join(import.meta.dirname, '__agent-cost-test-tmp__')

function setup(files: Record<string, string>) {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const full = join(TMP, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
}

afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('auditAgentCost', () => {
  it('passes when .claudeignore exists and effortLevel is set', async () => {
    setup({
      '.claudeignore': 'node_modules/\n',
      '.claude/settings.json': JSON.stringify({ effortLevel: 'medium' }),
    })
    const result = await auditAgentCost(TMP)
    // LSP checks may still fire (no .rs/.go in tmp), but the two main checks pass
    const mainViolations = result.violations.filter(
      (v) => v.file === '.claudeignore' || v.file === '.claude/settings.json',
    )
    expect(mainViolations).toHaveLength(0)
  })

  it('reports violation when .claudeignore is missing', async () => {
    setup({
      '.claude/settings.json': JSON.stringify({ effortLevel: 'medium' }),
    })
    const result = await auditAgentCost(TMP)
    // advisory — ok is always true; violations carry the warnings
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.file === '.claudeignore')).toBe(true)
  })

  it('reports violation when effortLevel is missing from project settings', async () => {
    setup({
      '.claudeignore': 'node_modules/\n',
      '.claude/settings.json': JSON.stringify({ hooks: {} }),
    })
    const result = await auditAgentCost(TMP)
    expect(result.ok).toBe(true)
    expect(
      result.violations.some(
        (v) => v.file === '.claude/settings.json' && v.message.includes('effortLevel'),
      ),
    ).toBe(true)
  })

  it('reports violation when .claude/settings.json does not exist', async () => {
    setup({ '.claudeignore': 'node_modules/\n' })
    const result = await auditAgentCost(TMP)
    expect(result.ok).toBe(true)
    expect(
      result.violations.some(
        (v) => v.file === '.claude/settings.json' && v.message.includes('not found'),
      ),
    ).toBe(true)
  })

  it('reports violation when .ignore is missing', async () => {
    setup({
      '.claudeignore': 'node_modules/\n',
      '.claude/settings.json': JSON.stringify({ effortLevel: 'medium' }),
    })
    const result = await auditAgentCost(TMP)
    expect(result.ok).toBe(true)
    expect(result.violations.some((v) => v.file === '.ignore')).toBe(true)
  })

  it('no .ignore violation when file exists', async () => {
    setup({
      '.claudeignore': 'node_modules/\n',
      '.claude/settings.json': JSON.stringify({ effortLevel: 'medium' }),
      '.ignore': 'webpresso/blueprints/completed/\n',
    })
    const result = await auditAgentCost(TMP)
    expect(result.violations.some((v) => v.file === '.ignore')).toBe(false)
  })

  it('reports title and checked count', async () => {
    setup({ '.claudeignore': 'node_modules/\n' })
    const result = await auditAgentCost(TMP)
    expect(result.title).toBe('agent cost config')
    expect(result.checked).toBeGreaterThanOrEqual(4) // .claudeignore + effortLevel + 2 LSP checks + .ignore
  })
})
