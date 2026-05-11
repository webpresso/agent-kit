import { describe, expect, it } from 'vitest'

import { createPlaywrightE2ePreset, defineE2ePresetSuite, resolveE2ePresetSuite } from './index.js'

describe('createPlaywrightE2ePreset', () => {
  it('returns a Playwright-compatible config object', () => {
    expect(createPlaywrightE2ePreset({ testDir: 'e2e', timeout: 30_000 })).toEqual({
      testDir: 'e2e',
      timeout: 30_000,
      fullyParallel: true,
      reporter: [['list']],
      use: {
        trace: 'retain-on-failure',
      },
    })
  })
})

describe('suite helpers', () => {
  const suites = [
    defineE2ePresetSuite({
      id: 'journeys',
      runner: 'playwright',
      configPath: 'playwright.config.ts',
      fileMatchers: ['journeys/'],
    }),
  ]

  it('resolves suite manifests from normalized file paths', () => {
    expect(resolveE2ePresetSuite({ file: 'apps/e2e/journeys/login.spec.ts', suites })?.id).toBe(
      'journeys',
    )
  })
})
