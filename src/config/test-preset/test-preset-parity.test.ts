import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as foldedIndex from './index.js'
import * as foldedVitest from './vitest.js'

type TestPresetModule = typeof import('./index.js')

const LEGACY_ENTRYPOINT = join(process.cwd(), 'packages', 'agent-test-preset', 'src', 'index.ts')
const PARENT_RELATIVE_SEGMENT = ['.', '.'].join('/')

async function importLegacyModule(): Promise<TestPresetModule> {
  return (await import(pathToFileURL(LEGACY_ENTRYPOINT).href)) as TestPresetModule
}

describe('folded test preset parity', () => {
  it('preserves the legacy public export surface', async () => {
    const legacy = await importLegacyModule()

    expect(Object.keys(foldedIndex).sort()).toEqual(Object.keys(legacy).sort())
    expect(foldedVitest).toMatchObject(foldedIndex)
  })

  it('matches defineTestPreset behavior from @webpresso/agent-test-preset', async () => {
    const legacy = await importLegacyModule()
    const options = {
      name: 'node-pubsub',
      include: ['src/**/*.test.ts'],
      exclude: ['fixtures/**'],
      environment: 'happy-dom' as const,
      globals: false,
      restoreMocks: false,
      coverage: true,
    }

    expect(foldedIndex.defineTestPreset(options)).toEqual(legacy.defineTestPreset(options))
  })

  it('matches createNodeTestPreset defaults without Webpresso path assumptions', async () => {
    const legacy = await importLegacyModule()
    const config = foldedIndex.createNodeTestPreset({ name: 'node-pubsub' })

    expect(config).toEqual(legacy.createNodeTestPreset({ name: 'node-pubsub' }))
    expect(config.test?.environment).toBe('node')
    expect(config.test?.include).toEqual(['src/**/*.test.ts', 'src/**/*.spec.ts'])
    expect(JSON.stringify(config)).not.toContain('webpresso')
  })

  it('folds source locally instead of re-exporting from archived packages', () => {
    for (const fileName of ['index.ts', 'vitest.ts']) {
      const source = readFileSync(join(import.meta.dirname, fileName), 'utf8')

      expect(source).not.toContain('packages/agent-test-preset')
      expect(source).not.toContain(PARENT_RELATIVE_SEGMENT)
    }
  })
})
