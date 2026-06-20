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

  test('flags direct infisical export invocation in source file', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'deploy.ts'), "exec('infisical export --projectId=demo --env=stg')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('direct infisical'),
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

  test('flags generic with-secrets wrapper usage in source file', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), "exec('with-secrets -- node server.js')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('legacy with-secrets wrapper'),
      }),
    ])
  })

  test('flags with-secrets invocation without a double-dash separator', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), "exec('with-secrets act -W .github/workflows/ci.yml')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('legacy with-secrets wrapper'),
      }),
    ])
  })

  test('flags direct infisical run invocation without a wrapper', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), "exec('infisical run --env=stg -- node server.js')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('direct infisical'),
      }),
    ])
  })

  test('passes for clean source', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), "exec('wp secrets run --sink dev-server --profile preview -- node server.js')")

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  test('allows shipped reusable workflows to use provider bootstrapping internally', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(root, '.github', 'workflows', 'cloudflare-preview.yml'),
      'steps:\\n  - run: infisical export --projectId="$INFISICAL_PROJECT_ID" --env="$INFISICAL_ENV_SLUG" --format=json\\n',
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  test('allows shipped docs and parity tests to mention approved provider bootstrap commands', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs'), { recursive: true })
    mkdirSync(join(root, 'src', 'build'), { recursive: true })
    writeFileSync(
      join(root, 'docs', 'reusable-cloudflare-deploy-workflows.md'),
      '`infisical export --projectId="$INFISICAL_PROJECT_ID" --env="$INFISICAL_ENV_SLUG" --format=json`',
    )
    writeFileSync(
      join(root, 'src', 'build', 'reusable-cloudflare-workflows.test.ts'),
      'expect(workflow).toContain(\'infisical export --projectId="${INFISICAL_PROJECT_ID}"\')',
    )

    const result = auditSecretProviderQuarantine(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
