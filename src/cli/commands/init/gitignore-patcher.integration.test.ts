import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  GENERATED_PATHS_BLOCK,
  patchGitignore,
  untrackGeneratedGitignoredPaths,
} from './gitignore-patcher.js'

describe('generated agent-surface gitignore block', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'wp-gitignore-patcher-'))
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
    expect(after.trimEnd()).toMatch(/# <<< managed by webpresso \(generated\)$/)
    expect(after).toContain('.codex/')
    expect(after).toContain('.omx/')
    expect(after).toContain('_worktrees/')
    expect(after).toContain('.webpresso/hooks-manifest.json')
    expect(after).toContain('.stryker-tmp/')
    expect(after).toContain('reports/mutation/')
    expect(after).toContain('reports/stryker-incremental.json')
    expect(after).toContain('stryker-setup-*.js')

    const ignored = spawnSync(
      'git',
      [
        'check-ignore',
        '--no-index',
        '.codex/agents/planner.toml',
        '.codex/skills/verify/SKILL.md',
        '.codex/prompts/planner.md',
        '.omx/setup-scope.json',
        '.webpresso/hooks-manifest.json',
        '.claude/settings.json',
        '.claude/settings.local.json',
        '.claude/hooks/custom-tool.sh',
        '_worktrees/agent-fix-login/.git',
        '.stryker-tmp/sandbox.json',
        'reports/mutation/mutation-report.html',
        'reports/stryker-incremental.json',
        'stryker-setup-123.js',
      ],
      { cwd: repo, encoding: 'utf8' },
    )
    expect(ignored.status).toBe(0)
    expect(ignored.stdout.trim().split('\n').toSorted()).toEqual([
      '.claude/hooks/custom-tool.sh',
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.codex/agents/planner.toml',
      '.codex/prompts/planner.md',
      '.codex/skills/verify/SKILL.md',
      '.omx/setup-scope.json',
      '.stryker-tmp/sandbox.json',
      '.webpresso/hooks-manifest.json',
      '_worktrees/agent-fix-login/.git',
      'reports/mutation/mutation-report.html',
      'reports/stryker-incremental.json',
      'stryker-setup-123.js',
    ])
  })

  it('ignores local Claude runtime noise without requiring a blanket .claude/ ignore', () => {
    const result = patchGitignore(join(repo, '.gitignore'), GENERATED_PATHS_BLOCK, {
      overwrite: true,
    })
    expect(result.action).toBe('created')

    const after = readFileSync(join(repo, '.gitignore'), 'utf8')
    expect(after).toContain('.claude/settings.json')
    expect(after).toContain('.claude/settings.local.json')
    expect(after).toContain('.claude/hooks/')
    expect(after).not.toContain('\n.claude/\n')
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

  it('removes legacy tracked generated surfaces from the git index', () => {
    mkdirSync(join(repo, '.claude', 'rules'), { recursive: true })
    mkdirSync(join(repo, '.stryker-tmp'), { recursive: true })
    mkdirSync(join(repo, 'reports', 'mutation'), { recursive: true })
    writeFileSync(join(repo, '.claude', 'rules', 'agent-guide.md'), 'generated rule\n')
    writeFileSync(join(repo, '.claude', 'settings.json'), '{}\n')
    writeFileSync(join(repo, '.stryker-tmp', 'sandbox.json'), '{}\n')
    writeFileSync(join(repo, 'reports', 'mutation', 'mutation-report.html'), '<html></html>\n')
    writeFileSync(join(repo, 'reports', 'stryker-incremental.json'), '{}\n')
    writeFileSync(join(repo, 'stryker-setup-123.js'), 'export default {}\n')
    writeFileSync(join(repo, 'AGENTS.md'), 'canonical instruction surface\n')

    const add = spawnSync(
      'git',
      [
        'add',
        '-f',
        '.claude/rules/agent-guide.md',
        '.claude/settings.json',
        '.stryker-tmp/sandbox.json',
        'reports/mutation/mutation-report.html',
        'reports/stryker-incremental.json',
        'stryker-setup-123.js',
        'AGENTS.md',
      ],
      { cwd: repo, encoding: 'utf8' },
    )
    expect(add.status).toBe(0)

    patchGitignore(join(repo, '.gitignore'), GENERATED_PATHS_BLOCK, { overwrite: true })
    const cleanup = untrackGeneratedGitignoredPaths(repo, GENERATED_PATHS_BLOCK)

    expect(cleanup.kind).toBe('ok')
    expect(cleanup.removedPaths).toEqual(
      expect.arrayContaining([
        '.claude/rules/agent-guide.md',
        '.claude/settings.json',
        '.stryker-tmp/sandbox.json',
        'reports/mutation/mutation-report.html',
        'reports/stryker-incremental.json',
        'stryker-setup-123.js',
      ]),
    )
    expect(existsSync(join(repo, '.claude', 'rules', 'agent-guide.md'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(true)
    expect(existsSync(join(repo, '.stryker-tmp', 'sandbox.json'))).toBe(true)
    expect(existsSync(join(repo, 'reports', 'mutation', 'mutation-report.html'))).toBe(true)
    expect(existsSync(join(repo, 'reports', 'stryker-incremental.json'))).toBe(true)
    expect(existsSync(join(repo, 'stryker-setup-123.js'))).toBe(true)

    const tracked = spawnSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
    expect(tracked.status).toBe(0)
    expect(tracked.stdout).not.toContain('.claude/rules/agent-guide.md')
    expect(tracked.stdout).not.toContain('.claude/settings.json')
    expect(tracked.stdout).not.toContain('.stryker-tmp/sandbox.json')
    expect(tracked.stdout).not.toContain('reports/mutation/mutation-report.html')
    expect(tracked.stdout).not.toContain('reports/stryker-incremental.json')
    expect(tracked.stdout).not.toContain('stryker-setup-123.js')
    expect(tracked.stdout).toContain('AGENTS.md')
  })
})
