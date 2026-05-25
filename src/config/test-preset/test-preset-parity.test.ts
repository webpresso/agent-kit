import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as foldedIndex from './index.js'
import * as foldedVitest from './vitest.js'

const PARENT_RELATIVE_SEGMENT = ['.', '.'].join('/')

describe('folded test preset parity', () => {
  it('preserves the canonical public export surface', async () => {
    expect(Object.keys(foldedIndex).sort()).toEqual(['createNodeTestPreset', 'defineTestPreset'])
    expect(foldedVitest).toMatchObject(foldedIndex)
  })

  it('builds a stable defineTestPreset result', async () => {
    const options = {
      name: 'node-pubsub',
      include: ['src/**/*.test.ts'],
      exclude: ['fixtures/**'],
      environment: 'happy-dom' as const,
      globals: false,
      restoreMocks: false,
      coverage: true,
    }

    expect(foldedIndex.defineTestPreset(options)).toEqual({
      test: expect.objectContaining({
        name: 'node-pubsub',
        include: ['src/**/*.test.ts'],
        exclude: ['fixtures/**'],
        environment: 'happy-dom',
        globals: false,
        restoreMocks: false,
      }),
    })
  })

  it('matches createNodeTestPreset defaults without Webpresso path assumptions', async () => {
    const config = foldedIndex.createNodeTestPreset({ name: 'node-pubsub' })

    expect(config.test?.environment).toBe('node')
    expect(config.test?.include).toEqual(['src/**/*.test.ts', 'src/**/*.spec.ts'])
    expect(JSON.stringify(config)).not.toContain('webpresso')
  })

  it('folds source locally instead of re-exporting from archived packages', () => {
    for (const fileName of ['index.ts', 'vitest.ts']) {
      const source = readFileSync(join(import.meta.dirname, fileName), 'utf8')

      expect(source).not.toContain(`packages/${'agent-test-preset'}`)
      expect(source).not.toContain(PARENT_RELATIVE_SEGMENT)
    }
  })
})
