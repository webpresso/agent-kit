import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditGitHubActionsSecrets } from './github-actions-secrets.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-gh-secrets-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  return root
}

describe('auditGitHubActionsSecrets', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  test('passes when no workflows directory exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-gh-secrets-empty-'))
    tempDirs.push(root)
    const result = auditGitHubActionsSecrets(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  test('flags secret-bearing workflow that uses secrets: inherit and non-SHA pin', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'bad.yml'),
      [
        'on:',
        '  workflow_call:',
        '    secrets: inherit',
        'jobs:',
        '  deploy:',
        '    permissions:',
        '      contents: read',
        '    steps:',
        '      - uses: dopplerhq/secrets-fetch-action@v2',
      ].join('\n'),
    )

    const result = auditGitHubActionsSecrets(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message).join('\n')).toContain('secrets: inherit')
    expect(result.violations.map((v) => v.message).join('\n')).toContain('40-character SHA')
    expect(result.violations.map((v) => v.message).join('\n')).toContain('id-token: write')
    expect(result.violations.map((v) => v.message).join('\n')).toContain('ci_secret_provider_token explicitly')
  })

  test('passes for explicit secret contract with full SHA pin and id-token write', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'good.yml'),
      [
        'on:',
        '  workflow_call:',
        '    secrets:',
        '      ci_secret_provider_token:',
        '        required: false',
        'jobs:',
        '  deploy:',
        '    permissions:',
        '      contents: read',
        '      packages: read',
        '      id-token: write',
        '    steps:',
        '      - uses: dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534',
      ].join('\n'),
    )

    const result = auditGitHubActionsSecrets(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
