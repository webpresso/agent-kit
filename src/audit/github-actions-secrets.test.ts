import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditGithubActionsSecrets } from './github-actions-secrets.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-gh-secrets-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  writeFileSync(
    join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
  )
  return root
}

describe('auditGithubActionsSecrets', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips when secrets.config.json is absent (gate)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-gh-secrets-gate-'))
    tempDirs.push(root)

    const result = auditGithubActionsSecrets(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toStrictEqual([])
  })

  test('flags secrets: inherit in reusable workflows', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'preview.yml'),
      [
        'on:',
        '  workflow_call:',
        'jobs:',
        '  deploy:',
        '    uses: webpresso/github-actions/.github/workflows/cloudflare-preview.yml@main',
        '    secrets: inherit',
        '',
      ].join('\n'),
    )

    const result = auditGithubActionsSecrets(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('secrets: inherit'),
        }),
      ]),
    )
  })

  test('flags unpinned secret-bearing actions', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'preview.yml'),
      [
        'on:',
        '  workflow_call:',
        'jobs:',
        '  deploy:',
        '    steps:',
        '      - uses: dopplerhq/secrets-fetch-action@v2',
        '',
      ].join('\n'),
    )

    const result = auditGithubActionsSecrets(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('full SHA'),
        }),
      ]),
    )
  })

  test('flags reusable workflows that depend on environment secrets', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'preview.yml'),
      [
        'on:',
        '  workflow_call:',
        'jobs:',
        '  deploy:',
        '    environment: preview',
        '',
      ].join('\n'),
    )

    const result = auditGithubActionsSecrets(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('GitHub Environment secrets'),
        }),
      ]),
    )
  })

  test('passes explicit reusable workflow secret contracts with SHA-pinned actions', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.github', 'workflows', 'preview.yml'),
      [
        'on:',
        '  workflow_call:',
        '    secrets:',
        '      ci_secret_provider_token:',
        '        required: true',
        'jobs:',
        '  deploy:',
        '    steps:',
        '      - uses: dopplerhq/secrets-fetch-action@451892f16195f9ac360e1a5bcbf0b5fd0e957534',
        '',
      ].join('\n'),
    )

    const result = auditGithubActionsSecrets(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
