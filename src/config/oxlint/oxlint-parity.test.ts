import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as foldedExports from './index.js'
import oxlintConfig from './oxlint-config.fixture.js'

const LEGACY_INDEX_PATH = join(process.cwd(), 'packages/agent-oxlint/src/index.js')

function legacyExportNames() {
  const legacyIndexSource = readFileSync(LEGACY_INDEX_PATH, 'utf8')

  return [...legacyIndexSource.matchAll(/export \{ default as (?<name>\w+) \}/g)].map(
    (match) => match.groups?.name,
  )
}

describe('folded oxlint exports', () => {
  it('preserves every top-level plugin export from @webpresso/agent-oxlint', () => {
    expect(legacyExportNames()).toEqual([
      'codeSafety',
      'foundationPurity',
      'graphqlConventions',
      'importHygiene',
      'monorepoNpaths',
      'queryPatterns',
      'testingQuality',
      'tierBoundaries',
    ])

    expect(legacyExportNames().filter((name) => !name || !(name in foldedExports))).toEqual([])
  })

  it('keeps folded plugin modules importable with valid oxlint plugin shape', async () => {
    for (const name of legacyExportNames()) {
      expect(name).toBeTruthy()
      const plugin = foldedExports[name as keyof typeof foldedExports] as {
        meta?: { name?: unknown }
        rules?: unknown
      }

      expect(typeof plugin.meta?.name, `${name}: plugin meta name`).toBe('string')
      expect(typeof plugin.rules, `${name}: plugin rules`).toBe('object')
    }
  })

  it('exports an oxlint.config.ts-compatible config object', async () => {
    const config = foldedExports.config

    expect(config).toBe(oxlintConfig)
    expect(config).toEqual({
      plugins: expect.any(Object),
      rules: expect.any(Object),
    })

    for (const name of legacyExportNames()) {
      const plugin = foldedExports[name as keyof typeof foldedExports] as {
        meta: { name: string }
        rules: Record<string, unknown>
      }

      expect(config.plugins[plugin.meta.name]).toBe(plugin)

      for (const ruleName of Object.keys(plugin.rules)) {
        expect(config.rules[`${plugin.meta.name}/${ruleName}`]).toBe('error')
      }
    }
  })

  it('can import the folded entrypoint from an oxlint config module', async () => {
    const fixtureModuleUrl = pathToFileURL(join(import.meta.dirname, 'oxlint-config.fixture.ts'))
    const fixtureModule = await import(fixtureModuleUrl.href)

    expect(fixtureModule.default).toBe(foldedExports.config)
  })
})
