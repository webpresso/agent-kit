import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

describe('root Stryker config', () => {
  it('loads from source without requiring the published webpresso package', async () => {
    const configUrl = pathToFileURL(resolve(process.cwd(), 'stryker.config.ts')).href
    const config = (await import(configUrl)).default

    expect(config.vitest.configFile).toBe('vitest.stryker.config.ts')
    expect(config.thresholds).toStrictEqual({
      high: 85,
      low: 85,
      break: 85,
    })
  })
})
