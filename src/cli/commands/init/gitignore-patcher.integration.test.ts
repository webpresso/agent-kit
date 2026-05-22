import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GENERATED_PATHS_BLOCK, patchGitignore } from './gitignore-patcher.js'

describe('generated agent-surface gitignore block', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'ak-gitignore-patcher-'))
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' })
    expect(init.status).toBe(0)
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('places the generated block after Codex unignore rules so setup output stays ignored', () => {
    writeFileSync(
      join(repo, '.gitignore'),
      [
        'node_modules/',
        '# consumer exceptions that must not re-expose generated surfaces',
        '!.codex/agents/',
        '!.codex/agents/**',
        '!.codex/skills/',
        '!.codex/skills/**',
        '',
      ].join('\n'),
    )

    const result = patchGitignore(join(repo, '.gitignore'), GENERATED_PATHS_BLOCK, {
      overwrite: true,
    })

    expect(result.action).toBe('overwritten')
    const after = readFileSync(join(repo, '.gitignore'), 'utf8')
    expect(after.trimEnd()).toMatch(/# <<< managed by @webpresso\/agent-kit \(generated\)$/)
    expect(after).toContain('.codex/')
    expect(after).toContain('.omx/')

    const ignored = spawnSync(
      'git',
      [
        'check-ignore',
        '--no-index',
        '.codex/agents/planner.toml',
        '.codex/skills/verify/SKILL.md',
        '.codex/prompts/planner.md',
        '.omx/setup-scope.json',
      ],
      { cwd: repo, encoding: 'utf8' },
    )
    expect(ignored.status).toBe(0)
    expect(ignored.stdout.trim().split('\n').toSorted()).toEqual([
      '.codex/agents/planner.toml',
      '.codex/prompts/planner.md',
      '.codex/skills/verify/SKILL.md',
      '.omx/setup-scope.json',
    ])
  })

  it('is idempotent after setup has moved the block to the end', () => {
    writeFileSync(
      join(repo, '.gitignore'),
      ['node_modules/', '', '# user-owned exception', '!README.md', ''].join('\n'),
    )

    patchGitignore(join(repo, '.gitignore'), GENERATED_PATHS_BLOCK, { overwrite: true })
    const first = readFileSync(join(repo, '.gitignore'), 'utf8')
    const second = patchGitignore(join(repo, '.gitignore'), GENERATED_PATHS_BLOCK, {
      overwrite: true,
    })

    expect(second.action).toBe('identical')
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe(first)
  })
})
