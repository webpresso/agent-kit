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

  test('flags legacy pre-schemaVersion-1 config', () => {
    const root = tempRepo()
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('only schemaVersion 1')
  })

  test('passes for valid schemaVersion 1 config', () => {
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
            project: 'edge-matte',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
          production: { provider: 'default', environment: 'prd' },
        },
        sinks: {
          'dev-server': { defaultProfile: 'preview', allowedOps: ['run'] },
        },
      }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
    expect(result.violations).toStrictEqual([])
  })

  test('reuses the full orchestration schema for v1 configs', () => {
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
            project: 'Edge Matte',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
        },
        sinks: {
          'dev-server': { defaultProfile: 'missing', allowedOps: ['run'] },
        },
      }),
    )

    const result = auditSecretsConfig(root)

    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toMatch(/project|default profile/i)
  })
})
