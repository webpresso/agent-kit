import { describe, expect, test } from 'vitest'

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { auditBlueprintPrCoverage } from './blueprint-pr-coverage.js'

const FAST_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_KEY_0: 'core.fsync',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_VALUE_0: 'none',
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: FAST_GIT_ENV,
  }).trim()
}

describe('auditBlueprintPrCoverage git integration', () => {
  test(
    'resolves changed files and exemption trailers from a git base ref',
    { timeout: 60_000 },
    () => {
      const repo = mkdtempSync(join(tmpdir(), 'blueprint-pr-coverage-'))
      git(repo, ['init'])
      git(repo, ['config', 'user.name', 'Test User'])
      git(repo, ['config', 'user.email', 'test@example.com'])
      writeFileSync(join(repo, 'README.md'), '# repo\n')
      git(repo, ['add', 'README.md'])
      git(repo, ['commit', '-m', 'docs: seed'])
      const base = git(repo, ['rev-parse', 'HEAD'])

      mkdirSync(join(repo, 'src'), { recursive: true })
      writeFileSync(join(repo, 'src', 'index.ts'), 'export const value = 1\n')
      git(repo, ['add', 'src/index.ts'])
      git(repo, [
        'commit',
        '-m',
        'fix: generated one-line typo',
        '-m',
        'Blueprint-exempt: generated one-line typo only',
      ])

      const result = auditBlueprintPrCoverage(repo, { baseRef: base })

      expect(result.ok).toBe(true)
      expect(result.checked).toBe(1)
      expect(result.violations[0]?.message).toBe(
        '[warn] Blueprint-exempt trailer present: generated one-line typo only',
      )
    },
  )
})
