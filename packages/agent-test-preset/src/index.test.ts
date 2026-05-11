import { describe, expect, it } from 'vitest'

import { createNodeTestPreset, defineTestPreset } from './index.js'

describe('defineTestPreset', () => {
  it('returns a defineConfig-compatible object', () => {
    const config = defineTestPreset({
      name: 'node-pubsub',
      include: ['src/**/*.test.ts'],
    })

    expect(config.test?.name).toBe('node-pubsub')
    expect(config.test?.include).toEqual(['src/**/*.test.ts'])
  })
})

describe('createNodeTestPreset', () => {
  it('provides node-focused defaults without Webpresso path assumptions', () => {
    const config = createNodeTestPreset({ name: 'node-pubsub' })

    expect(config.test?.environment).toBe('node')
    expect(config.test?.include).toEqual(['src/**/*.test.ts', 'src/**/*.spec.ts'])
    expect(JSON.stringify(config)).not.toContain('webpresso')
  })
})
