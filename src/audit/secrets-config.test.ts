import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditSecretsConfig } from './secrets-config.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-secrets-config-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  return root
}

describe('auditSecretsConfig', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips when secrets.config.json is absent', () => {
    const root = tempRepo()

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toStrictEqual([])
  })

  test('flags invalid JSON', () => {
    const root = tempRepo()
    writeFileSync(join(root, '.webpresso', 'secrets.config.json'), '{ invalid json }')

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: '.webpresso/secrets.config.json',
        message: expect.stringContaining('Invalid JSON'),
      }),
    ])
  })

  test('flags secret-like value in config', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({ manager: 'doppler', projectId: 'my-project', token: 'ghp_abc12345678' }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  test('passes for valid config', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
    expect(result.violations).toStrictEqual([])
  })


  test('passes for schemaVersion 1 config with default provider and profiles', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: {
          default: {
            type: 'doppler',
            workspace: 'ozby',
            workspaceId: '7abb07fb8507f57c2011',
            project: 'my-project',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
        },
        sinks: {
          test: { defaultProfile: 'preview', allowedOps: ['run'] },
        },
      }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })


  test('validates schemaVersion 1 config from nested working directories', () => {
    const root = tempRepo()
    const nested = join(root, 'apps', 'web')
    mkdirSync(nested, { recursive: true })
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: {
          default: {
            type: 'doppler',
            project: 'my-project',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
        },
        sinks: {},
      }),
    )

    const result = auditSecretsConfig(nested)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
    expect(result.violations).toStrictEqual([])
  })

  test('rejects schemaVersion 1 profiles that point at an unknown provider', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        schemaVersion: 1,
        providers: { default: { type: 'doppler', project: 'my-project' } },
        profiles: { preview: { provider: 'missing', environment: 'stg' } },
        sinks: {},
      }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({ message: expect.stringContaining('unknown provider "missing"') }),
    ])
  })

  test('passes for valid config with named profiles', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({
        manager: 'doppler',
        projectId: 'my-project',
        profiles: {
          'e2e-runtime': { environment: 'dev' },
          'deploy-preview': { environment: 'preview' },
        },
      }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
