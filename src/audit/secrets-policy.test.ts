import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditSecretsPolicy } from './secrets-policy.js'

const tempDirs: string[] = []

function tempRepo(withGit = false): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-secrets-policy-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  writeFileSync(
    join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
  )
  if (withGit) {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init', '--allow-empty'], { cwd: root, stdio: 'ignore' })
  }
  return root
}

describe('auditSecretsPolicy', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips when secrets.config.json is absent (gate)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-secrets-policy-gate-'))
    tempDirs.push(root)

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toStrictEqual([])
  })

  test('flags forbidden secret file on disk (working tree)', () => {
    const root = tempRepo()
    writeFileSync(join(root, '.dev.vars'), 'API_KEY=abc123')

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({ file: '.dev.vars', message: expect.stringContaining('forbidden secret carrier') }),
    ])
  })

  test('handles non-git repo gracefully (no git dir)', () => {
    const root = tempRepo(false)

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(true)
  })

  test('flags tracked forbidden path in git', () => {
    const root = tempRepo(true)
    writeFileSync(join(root, '.env'), 'API_KEY=value')
    execFileSync('git', ['add', '.env'], { cwd: root, stdio: 'ignore' })

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('tracked forbidden secret carrier') }),
      ]),
    )
  })

  test('flags tracked file with secret-like value pattern', () => {
    const root = tempRepo(true)
    const secretContent = 'token: ghp_aAbBcCdDeEfFgGhH123456789012'
    writeFileSync(join(root, 'config.json'), JSON.stringify({ info: secretContent }))
    execFileSync('git', ['add', 'config.json'], { cwd: root, stdio: 'ignore' })

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({ message: expect.stringContaining('secret-like value pattern') }),
    ])
  })

  test('passes for clean git repo', () => {
    const root = tempRepo(true)
    writeFileSync(join(root, 'readme.md'), '# My project')
    execFileSync('git', ['add', 'readme.md'], { cwd: root, stdio: 'ignore' })

    const result = auditSecretsPolicy(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
