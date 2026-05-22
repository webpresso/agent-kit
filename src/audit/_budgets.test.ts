import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BUDGETS, loadBudgets } from './_budgets.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `wp-budgets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('DEFAULT_BUDGETS', () => {
  it('has expected keys with positive max_bytes', () => {
    expect(DEFAULT_BUDGETS['codex-skill-listing-total'].max_bytes).toBe(7000)
    expect(DEFAULT_BUDGETS['claude-skill-description-each'].max_bytes).toBe(800)
    expect(DEFAULT_BUDGETS['agents-md-section-each'].max_bytes).toBe(4096)
    expect(DEFAULT_BUDGETS['agents-md-section-each'].suggest_compact_at).toBe(0.75)
    expect(DEFAULT_BUDGETS['skill-md-total-each'].max_bytes).toBe(16384)
  })
})

describe('loadBudgets', () => {
  it('returns defaults when no config file exists', () => {
    const budgets = loadBudgets(tmpDir)
    expect(budgets['codex-skill-listing-total'].max_bytes).toBe(7000)
    expect(budgets['skill-md-total-each'].max_bytes).toBe(16384)
  })

  it('merges file overrides with defaults', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    await writeFile(
      path.join(agentDir, '.audit-budgets.yaml'),
      [
        'budgets:',
        '  codex-skill-listing-total:',
        '    max_bytes: 5000',
        '  claude-skill-description-each:',
        '    max_bytes: 600',
      ].join('\n'),
      'utf8',
    )

    const budgets = loadBudgets(tmpDir)
    expect(budgets['codex-skill-listing-total'].max_bytes).toBe(5000)
    expect(budgets['claude-skill-description-each'].max_bytes).toBe(600)
    // Unoverridden default is still present
    expect(budgets['skill-md-total-each'].max_bytes).toBe(16384)
  })

  it('accepts extra keys from config file', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    await writeFile(
      path.join(agentDir, '.audit-budgets.yaml'),
      ['budgets:', '  custom-budget-key:', '    max_bytes: 2048'].join('\n'),
      'utf8',
    )

    const budgets = loadBudgets(tmpDir)
    expect((budgets as Record<string, { max_bytes: number }>)['custom-budget-key']?.max_bytes).toBe(
      2048,
    )
    // Defaults still present
    expect(budgets['codex-skill-listing-total'].max_bytes).toBe(7000)
  })

  it('falls back to defaults on malformed YAML', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    await writeFile(path.join(agentDir, '.audit-budgets.yaml'), '{{invalid yaml{{', 'utf8')

    const budgets = loadBudgets(tmpDir)
    expect(budgets['codex-skill-listing-total'].max_bytes).toBe(7000)
  })

  it('falls back to defaults on schema-invalid config', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    await writeFile(
      path.join(agentDir, '.audit-budgets.yaml'),
      ['budgets:', '  bad-entry:', '    max_bytes: -100'].join('\n'),
      'utf8',
    )

    const budgets = loadBudgets(tmpDir)
    // Should not throw; should return defaults
    expect(budgets['codex-skill-listing-total'].max_bytes).toBe(7000)
  })
})
