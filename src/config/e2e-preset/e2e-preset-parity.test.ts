import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as foldedIndex from './index.js'
import * as foldedPlaywright from './playwright.js'

type E2ePresetModule = typeof import('./index.js')

const LEGACY_ENTRYPOINT = join(process.cwd(), 'packages', 'agent-e2e-preset', 'src', 'index.ts')
const PARENT_RELATIVE_SEGMENT = ['.', '.'].join('/')

async function importLegacyModule(): Promise<E2ePresetModule> {
  return (await import(pathToFileURL(LEGACY_ENTRYPOINT).href)) as E2ePresetModule
}

describe('folded e2e preset parity', () => {
  it('preserves the legacy public export surface', async () => {
    const legacy = await importLegacyModule()

    expect(Object.keys(foldedIndex).sort()).toEqual(Object.keys(legacy).sort())
    expect(foldedPlaywright).toMatchObject({
      createPlaywrightE2ePreset: foldedIndex.createPlaywrightE2ePreset,
    })
  })

  it('matches createPlaywrightE2ePreset behavior from @webpresso/agent-e2e-preset', async () => {
    const legacy = await importLegacyModule()
    const options = {
      testDir: 'e2e',
      timeout: 30_000,
      fullyParallel: false,
      trace: 'on-first-retry' as const,
    }

    expect(foldedIndex.createPlaywrightE2ePreset(options)).toEqual(
      legacy.createPlaywrightE2ePreset(options),
    )
  })

  it('matches suite helper behavior from @webpresso/agent-e2e-preset', async () => {
    const legacy = await importLegacyModule()
    const suites = [
      foldedIndex.defineE2ePresetSuite({
        id: 'journeys',
        runner: 'playwright',
        configPath: 'playwright.config.ts',
        fileMatchers: ['journeys/'],
      }),
    ]

    expect(foldedIndex.normalizeE2ePresetPath('apps/e2e/journeys/login.spec.ts')).toBe(
      legacy.normalizeE2ePresetPath('apps/e2e/journeys/login.spec.ts'),
    )
    expect(foldedIndex.normalizeE2ePresetPath('apps\\e2e\\journeys\\login.spec.ts')).toBe(
      legacy.normalizeE2ePresetPath('apps\\e2e\\journeys\\login.spec.ts'),
    )
    expect(
      foldedIndex.resolveE2ePresetSuite({ file: 'apps/e2e/journeys/login.spec.ts', suites }),
    ).toEqual(legacy.resolveE2ePresetSuite({ file: 'apps/e2e/journeys/login.spec.ts', suites }))
    expect(foldedIndex.resolveE2ePresetSuite({ suite: 'journeys', suites })).toEqual(
      legacy.resolveE2ePresetSuite({ suite: 'journeys', suites }),
    )
  })

  it('folds source locally instead of re-exporting from archived packages', () => {
    for (const fileName of ['index.ts', 'playwright.ts']) {
      const source = readFileSync(join(import.meta.dirname, fileName), 'utf8')

      expect(source).not.toContain('packages/agent-e2e-preset')
      expect(source).not.toContain(PARENT_RELATIVE_SEGMENT)
    }
  })
})
