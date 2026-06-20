import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  readSecretsConfig,
  resolveSecretsConfigProfileEnvironment,
} from './secrets-config.js'

describe('runtime secrets config', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function tempRepo(config: Record<string, unknown>, runtimeConfig?: Record<string, unknown>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'wp-runtime-secrets-config-'))
    roots.push(root)
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    mkdirSync(path.join(root, '.webpresso'), { recursive: true })
    mkdirSync(path.join(root, '.git', 'webpresso'), { recursive: true })
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    )
    if (runtimeConfig) {
      writeFileSync(
        path.join(root, '.git', 'webpresso', 'secrets.json'),
        `${JSON.stringify(runtimeConfig, null, 2)}\n`,
      )
    }
    return root
  }

  it('reads repo-owned profiles from committed config', () => {
    const root = tempRepo({
      manager: 'doppler',
      projectId: 'demo',
      profiles: {
        'e2e-runtime': { environment: 'dev' },
      },
    })

    expect(readSecretsConfig(root)).toEqual({
      manager: 'doppler',
      projectId: 'demo',
      profiles: {
        'e2e-runtime': { environment: 'dev' },
      },
    })
    expect(resolveSecretsConfigProfileEnvironment('e2e-runtime', root)).toBe('dev')
  })


  it('reads schemaVersion 1 committed config from nested cwd', () => {
    const root = tempRepo({
      schemaVersion: 1,
      providers: {
        default: { type: 'doppler', project: 'demo-project' },
      },
      profiles: {
        preview: { provider: 'default', environment: 'stg' },
      },
      sinks: {},
    })
    const nested = path.join(root, 'apps', 'web')
    mkdirSync(nested, { recursive: true })

    expect(readSecretsConfig(nested)).toEqual({
      manager: 'doppler',
      projectId: 'demo-project',
      profiles: {
        preview: { environment: 'stg' },
      },
    })
    expect(resolveSecretsConfigProfileEnvironment('preview', nested)).toBe('stg')
  })

  it('preserves committed profiles when runtime config overrides only manager/project selection', () => {
    const root = tempRepo(
      {
        manager: 'doppler',
        projectId: 'committed-demo',
        profiles: {
          cleanup: { environment: 'prd' },
        },
      },
      {
        manager: 'infisical',
        projectId: 'runtime-demo',
      },
    )

    expect(readSecretsConfig(root)).toEqual({
      manager: 'infisical',
      projectId: 'runtime-demo',
      profiles: {
        cleanup: { environment: 'prd' },
      },
    })
    expect(resolveSecretsConfigProfileEnvironment('cleanup', root)).toBe('prd')
  })

  it('throws a clear error for unknown profile names', () => {
    const root = tempRepo({
      manager: 'doppler',
      projectId: 'demo',
      profiles: {
        deploy: { environment: 'preview' },
      },
    })

    expect(() => resolveSecretsConfigProfileEnvironment('missing', root)).toThrow(
      'Unknown secret profile "missing"',
    )
  })

  it('redacts secret-like unknown profile names from errors', () => {
    const root = tempRepo({
      manager: 'doppler',
      projectId: 'demo',
      profiles: {
        deploy: { environment: 'preview' },
      },
    })

    expect(() =>
      resolveSecretsConfigProfileEnvironment('ctx7sk-reviewleak000000', root),
    ).toThrow('Unknown secret profile "[redacted]"')
    expect(() =>
      resolveSecretsConfigProfileEnvironment('ctx7sk-reviewleak000000', root),
    ).not.toThrow('ctx7sk-reviewleak000000')
  })
})
