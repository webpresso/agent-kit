import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDeployPlan, runDeployPlan } from './run.js'
import * as managers from '#runtime/secret-managers.js'

describe('createDeployPlan', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `deploy-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('loads a configured deploy adapter and validates its plan', async () => {
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const webpressoDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        "    requiredCredentials: request.dryRun ? [] : ['CLOUDFLARE_API_TOKEN'],",
        "    steps: [{ kind: 'managed-tool', id: 'dry-run', tool: 'wrangler', args: ['deploy', '--dry-run'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )

    await expect(createDeployPlan({ cwd: root, lane: 'prd', dryRun: true })).resolves.toMatchObject(
      {
        schemaVersion: 1,
        lane: 'prd',
        provider: 'cloudflare',
        requiredCredentials: [],
        steps: [{ kind: 'managed-tool', tool: 'wrangler' }],
      },
    )
  })



  it('resolves production deploy secrets through the production profile environment', async () => {
    mkdirSync(join(root, '.webpresso'), { recursive: true })
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          providers: { default: { type: 'doppler', project: 'demo' } },
          profiles: {
            preview: { provider: 'default', environment: 'stg' },
            production: { provider: 'default', environment: 'prd' },
          },
          sinks: { 'deploy-wrangler': { defaultProfile: 'production', allowedOps: ['deploy'] } },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const webpressoDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        "    requiredCredentials: ['SECRET_ENV'],",
        "    steps: [{ kind: 'command', id: 'deploy', runtimeProfile: 'secrets-only', command: process.execPath, args: ['-e', 'process.exit(process.env.SECRET_ENV === \\\'prd\\\' ? 0 : 42)'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )
    const fetchSpy = vi.spyOn(managers, 'fetchSecretsForConfig').mockReturnValue({ SECRET_ENV: 'prd' })

    await expect(runDeployPlan({ cwd: root, lane: 'prd' })).resolves.toBe(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ manager: 'doppler', projectId: 'demo' }),
      expect.objectContaining({ cwd: root, environment: 'prd' }),
    )
  })

  it('resolves preview deploy secrets through the preview profile environment', async () => {
    mkdirSync(join(root, '.webpresso'), { recursive: true })
    writeFileSync(
      join(root, '.webpresso', 'secrets.config.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          providers: { default: { type: 'doppler', project: 'demo' } },
          profiles: {
            preview: { provider: 'default', environment: 'stg' },
            production: { provider: 'default', environment: 'prd' },
          },
          sinks: { 'deploy-wrangler': { defaultProfile: 'preview', allowedOps: ['preview'] } },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const webpressoDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        "    requiredCredentials: ['SECRET_ENV'],",
        "    steps: [{ kind: 'command', id: 'deploy', runtimeProfile: 'secrets-only', command: process.execPath, args: ['-e', 'process.exit(process.env.SECRET_ENV === \\\'stg\\\' ? 0 : 42)'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )
    const fetchSpy = vi.spyOn(managers, 'fetchSecretsForConfig').mockReturnValue({ SECRET_ENV: 'stg' })

    await expect(runDeployPlan({ cwd: root, lane: 'preview_main' })).resolves.toBe(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ manager: 'doppler', projectId: 'demo' }),
      expect.objectContaining({ cwd: root, environment: 'stg' }),
    )
  })

  it('rejects invalid lanes before invoking the adapter', async () => {
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(join(root, 'deploy-adapter.ts'), 'export default { createPlan: () => ({}) }\n')

    await expect(createDeployPlan({ cwd: root, lane: 'preview-pr-1' })).rejects.toThrow(
      'Invalid deploy lane',
    )
  })

  it('supports a custom adapterExport while keeping the adapterModule contract intact', async () => {
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts', adapterExport: 'customDeployAdapter' } }\n",
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const customDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        '    requiredCredentials: [],',
        "    steps: [{ kind: 'managed-tool', id: 'deploy', tool: 'wrangler', args: ['deploy', '--dry-run'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )

    await expect(createDeployPlan({ cwd: root, lane: 'prd', dryRun: true })).resolves.toMatchObject(
      {
        lane: 'prd',
        provider: 'cloudflare',
        steps: [{ kind: 'managed-tool', tool: 'wrangler' }],
      },
    )
  })
})
