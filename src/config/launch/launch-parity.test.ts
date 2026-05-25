import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as folded from './index'

describe('launch public API parity', () => {
  it('exports the canonical launch surface', async () => {
    expect(Object.keys(folded).sort()).toEqual([
      'assembleEffectiveVars',
      'buildLaunchRegistration',
      'parseDevManifest',
      'resolveDevTargets',
    ])
  })

  it('preserves launch env assembly behavior', async () => {
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

    expect(folded.assembleEffectiveVars(input)).toEqual({
      EXISTING: 'keep-me',
      INJECTED_SECRET: 'secret-value',
      DATABASE_URL: 'postgresql://runtime/db',
    })
  })

  it('preserves dev manifest parsing and target resolution behavior', async () => {
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

    const parsed = folded.parseDevManifest(manifest)

    expect(parsed.defaults.target).toBe('full')
    expect(parsed.groups.full?.services).toEqual(['web'])
    expect(folded.resolveDevTargets(parsed)).toEqual(['database', 'api', 'web'])
  })

  it('keeps source independent from deleted helper workspaces', async () => {
    const source = await import(pathToFileURL(`${import.meta.dirname}/index.ts`).href)

    expect(source).toBeDefined()
  })
})
