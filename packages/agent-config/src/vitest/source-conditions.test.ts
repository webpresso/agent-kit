import { describe, expect, it } from 'vitest'

import {
  createWebpressoSourceResolveConfig,
  webpressoSourceCondition,
  webpressoSourceResolveConditions,
  webpressoSourceSsrResolveConditions,
} from './source-conditions.js'

describe('webpresso source resolve conditions', () => {
  it('exposes the @webpresso/source condition contract', () => {
    expect(webpressoSourceCondition).toBe('@webpresso/source')
    expect([...webpressoSourceResolveConditions]).toStrictEqual(['@webpresso/source'])
    expect([...webpressoSourceSsrResolveConditions]).toStrictEqual([
      '@webpresso/source',
      'module',
      'node',
      'development|production',
    ])
  })

  it('builds resolve + ssr config with no optional keys by default', () => {
    const config = createWebpressoSourceResolveConfig()

    expect(config.resolve.conditions).toStrictEqual(['@webpresso/source'])
    expect(config.ssr.resolve.conditions).toStrictEqual([
      '@webpresso/source',
      'module',
      'node',
      'development|production',
    ])
    expect(config.resolve).not.toHaveProperty('tsconfigPaths')
    expect(config.resolve).not.toHaveProperty('alias')
    expect(config.resolve).not.toHaveProperty('dedupe')
  })

  it('threads through tsconfigPaths, alias, and dedupe when provided', () => {
    const alias = [{ find: '#x', replacement: '/src/x' }]
    const config = createWebpressoSourceResolveConfig({
      tsconfigPaths: true,
      alias,
      dedupe: ['react'],
    })

    expect(config.resolve.tsconfigPaths).toBe(true)
    expect(config.resolve.alias).toStrictEqual(alias)
    expect(config.resolve.dedupe).toStrictEqual(['react'])
  })

  it('preserves an explicit tsconfigPaths: false override', () => {
    const config = createWebpressoSourceResolveConfig({ tsconfigPaths: false })

    expect(config.resolve.tsconfigPaths).toBe(false)
  })
})
