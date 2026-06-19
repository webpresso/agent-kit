import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildRuntimeProcessEnv,
  createRuntimeEnvCache,
  resolveRuntimeEnvironment,
} from './executor.js'
import * as managers from './secret-managers.js'

describe('runtime executor', () => {
  const roots: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function repoRoot(overrides: Record<string, unknown> = {}): string {
    const root = mkdtempSync(path.join(tmpdir(), 'wp-runtime-env-'))
    roots.push(root)
    mkdirSync(path.join(root, '.webpresso'), { recursive: true })
    const config = {
      schemaVersion: 1,
      providers: {
        default: { type: 'doppler', project: 'demo' },
      },
      profiles: {
        preview: { provider: 'default', environment: 'dev' },
        prd: { provider: 'default', environment: 'prd' },
      },
      sinks: {
        test: { defaultProfile: 'preview', allowedOps: ['read'] },
      },
      ...overrides,
    }
    writeFileSync(
      path.join(root, '.webpresso', 'secrets.config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    )
    return root
  }

  it('treats none as direct execution', () => {
    const root = repoRoot()
    expect(resolveRuntimeEnvironment({ cwd: root, profile: 'none' })).toEqual({})
  })

  it('prepends repo-local node_modules bin to PATH exactly once', () => {
    const root = repoRoot()
    const env = buildRuntimeProcessEnv(root, {
      PATH: `/usr/bin${path.delimiter}${path.join(root, 'node_modules', '.bin')}`,
    })
    const localBin = path.join(root, 'node_modules', '.bin')
    expect(env.PATH?.split(path.delimiter).filter((value) => value === localBin)).toHaveLength(1)
  })

  it('caches provider resolution per invocation', () => {
    const root = repoRoot()
    const fetchSpy = vi
      .spyOn(managers, 'fetchSecretsForConfig')
      .mockReturnValue({ SECRET: 'value' })
    const cache = createRuntimeEnvCache()

    expect(resolveRuntimeEnvironment({ cwd: root, profile: 'secrets-only', cache })).toEqual({
      SECRET: 'value',
    })
    expect(resolveRuntimeEnvironment({ cwd: root, profile: 'secrets-only', cache })).toEqual({
      SECRET: 'value',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('uses explicit provider environment separately from canonical runtime profile', () => {
    const root = repoRoot()
    const fetchSpy = vi
      .spyOn(managers, 'fetchSecretsForConfig')
      .mockReturnValue({ SECRET: 'value' })

    resolveRuntimeEnvironment({ cwd: root, profile: 'secrets-only', environment: 'dev' })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ manager: 'doppler', projectId: 'demo' }),
      expect.objectContaining({ cwd: root, environment: 'dev' }),
    )
  })

  it('forwards provider-specific environment selectors', () => {
    const root = repoRoot()
    const fetchSpy = vi
      .spyOn(managers, 'fetchSecretsForConfig')
      .mockReturnValue({ SECRET: 'value' })

    resolveRuntimeEnvironment({ cwd: root, profile: 'prd' })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ manager: 'doppler', projectId: 'demo' }),
      expect.objectContaining({ cwd: root, environment: 'prd' }),
    )
  })
})
