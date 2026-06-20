import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditSecretProviderQuarantine } from './secret-provider-quarantine.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-quarantine-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  writeFileSync(
    join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
  )
  return root
}

describe('auditSecretProviderQuarantine', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips when secrets.config.json is absent (gate)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-quarantine-gate-'))
    tempDirs.push(root)

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toStrictEqual([])
  })

  test('flags direct doppler invocation in source file', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'deploy.ts'), "exec('doppler" + " run -- node server.js')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('direct doppler invocation'),
      }),
    ])
  })

  test('resolves repo root from nested cwd before scanning', () => {
    const root = tempRepo()
    const nested = join(root, 'apps', 'web')
    mkdirSync(nested, { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'deploy.ts'), "exec('doppler" + " run -- node server.js')")

    const result = auditSecretProviderQuarantine(nested)

    expect(result.ok).toBe(false)
    expect(result.checked).toBeGreaterThan(0)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('direct doppler invocation'),
      }),
    ])
  })

  test('flags with-secrets provider flag in source file', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'run.ts'),
      "exec('with-secrets" + " --doppler -- node server.js')",
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('provider flags'),
      }),
    ])
  })

  test('flags raw with-secrets act usage and local act helper clones', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(join(root, 'scripts', 'act-with-webpresso.ts'), "exec('with-secrets -- act -W .github/workflows/ci.yml')")
    writeFileSync(join(root, 'scripts', 'act-secret-profile.ts'), 'export const x = 1\n')

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain('wp ci act')
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain('act-secret-profile')
  })

  test('flags legacy CI fallback tokens and non-SHA action refs in secret-bearing workflows', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      [
        'name: ci',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: with-secrets -- act -W .github/workflows/ci.yml',
        '        env:',
        '          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}',
      ].join('\n'),
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain('SHA-pin third-party action actions/checkout@v4')
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain('DOPPLER_TOKEN fallback')
  })

  test('requires id-token write only for OIDC-capable secret workflows', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(root, '.github', 'workflows', 'deploy.yml'),
      [
        'name: deploy',
        'on:',
        '  workflow_call:',
        '    inputs:',
        '      doppler_identity_id:',
        '        required: false',
        '        type: string',
        'jobs:',
        '  deploy:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Checkout',
        '        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd',
      ].join('\n'),
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain(
      'id-token: write',
    )
  })

  test('flags non-SHA action refs for named-step uses entries in secret-bearing workflows', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(root, '.github', 'workflows', 'deploy.yml'),
      [
        'name: deploy',
        'jobs:',
        '  deploy:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Checkout',
        '        uses: actions/checkout@v4',
        '    secrets:',
        '      ci_secret_provider_token:',
        '        required: false',
        '    with:',
        '      secret_profile: preview',
      ].join('\n'),
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((entry) => entry.message).join('\n')).toContain(
      'SHA-pin third-party action actions/checkout@v4',
    )
  })

  test('passes for clean source', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), "exec('with-secrets -- node server.js')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
