import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as folded from './index'

type LaunchRuntimeApi = typeof folded

async function importLegacyLaunchApi(): Promise<LaunchRuntimeApi> {
  return (await import(
    pathToFileURL(`${process.cwd()}/packages/agent-launch/src/index.ts`).href
  )) as LaunchRuntimeApi
}

describe('launch public API parity', () => {
  it('keeps the same runtime exports as @webpresso/agent-launch', async () => {
    const legacy = await importLegacyLaunchApi()

    expect(Object.keys(folded).sort()).toEqual(Object.keys(legacy).sort())
  })

  it('preserves launch env assembly behavior', async () => {
    const legacy = await importLegacyLaunchApi()
    const input = {
      vars: { EXISTING: 'keep-me' },
      databaseHandle: {
        id: 'db-1',
        primaryConnectionUri: 'postgresql://primary/db',
        runtimeConnectionUri: 'postgresql://runtime/db',
      },
      databaseUrlSelector: (handle: {
        primaryConnectionUri: string
        runtimeConnectionUri?: string
      }) => ({
        runtimeDatabaseUrl: handle.runtimeConnectionUri ?? handle.primaryConnectionUri,
      }),
      secretInjector: (vars: Record<string, string>) => {
        vars.INJECTED_SECRET = 'secret-value'
      },
    }

    expect(folded.assembleEffectiveVars(input)).toEqual(legacy.assembleEffectiveVars(input))
  })

  it('preserves dev manifest parsing and target resolution behavior', async () => {
    const legacy = await importLegacyLaunchApi()
    const manifest = {
      version: 1,
      services: {
        database: { command: 'node', args: ['db.js'] },
        api: { command: 'node', args: ['api.js'], dependsOn: ['database'] },
        web: { command: 'node', args: ['web.js'], dependsOn: ['api'] },
      },
      groups: {
        full: { services: ['web'] },
      },
      defaults: {
        target: 'full',
      },
    } as const

    expect(folded.parseDevManifest(manifest)).toEqual(legacy.parseDevManifest(manifest))
    expect(folded.resolveDevTargets(folded.parseDevManifest(manifest))).toEqual(
      legacy.resolveDevTargets(legacy.parseDevManifest(manifest)),
    )
  })
})
