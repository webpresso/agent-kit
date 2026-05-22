import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GENERATED_PATHS_BLOCK } from '#cli/commands/init/gitignore-patcher'
import { auditGitignoreAgentSurfaces } from './gitignore-agent-surfaces.js'

const EXPECTED_PATHS = GENERATED_PATHS_BLOCK.patterns.filter((line) => !line.startsWith('#'))

function makeCompleteGitignore(): string {
  return EXPECTED_PATHS.join('\n') + '\n'
}

describe('auditGitignoreAgentSurfaces', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ak-gitignore-audit-'))
    dirs.push(d)
    return d
  }

  it('passes when all expected paths are present', async () => {
    const cwd = tmp()
    writeFileSync(join(cwd, '.gitignore'), makeCompleteGitignore())

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.checked).toBe(EXPECTED_PATHS.length)
  })

  it('fails when .gitignore is missing', async () => {
    const cwd = tmp()

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('.gitignore not found')
  })

  it('fails when one expected path is missing', async () => {
    const cwd = tmp()
    const lines = EXPECTED_PATHS.filter((p) => p !== '.claude/skills/')
    writeFileSync(join(cwd, '.gitignore'), lines.join('\n'))

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('.claude/skills/')
  })

  it('reports a violation for each missing path', async () => {
    const cwd = tmp()
    // Only include first 5 paths
    writeFileSync(join(cwd, '.gitignore'), EXPECTED_PATHS.slice(0, 5).join('\n'))

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(false)
    expect(result.violations.length).toBe(EXPECTED_PATHS.length - 5)
  })

  it('passes when .gitignore has additional unrelated entries', async () => {
    const cwd = tmp()
    const content = ['node_modules/', 'dist/', ...EXPECTED_PATHS, '*.log', '.DS_Store'].join('\n')
    writeFileSync(join(cwd, '.gitignore'), content)

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('fails when a later exception re-exposes a generated surface', async () => {
    const cwd = tmp()
    writeFileSync(join(cwd, '.gitignore'), [...EXPECTED_PATHS, '!.codex/agents/**', ''].join('\n'))

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('overridden by later exception')
  })

  it('title is "gitignore agent surfaces"', async () => {
    const cwd = tmp()
    writeFileSync(join(cwd, '.gitignore'), makeCompleteGitignore())

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.title).toBe('gitignore agent surfaces')
  })

  it('checked count equals number of expected paths', async () => {
    const cwd = tmp()
    writeFileSync(join(cwd, '.gitignore'), makeCompleteGitignore())

    const result = await auditGitignoreAgentSurfaces(cwd)

    expect(result.checked).toBe(EXPECTED_PATHS.length)
  })
})
