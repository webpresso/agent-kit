import { describe, expect, it } from 'vitest'

import {
  WebpressoConfigValidationError,
  defineWebpressoConfig,
  validateWebpressoConfig,
} from './config.js'

describe('defineWebpressoConfig', () => {
  it('returns the config unchanged', () => {
    const config = defineWebpressoConfig({
      e2e: {
        hostAdapterModule: './apps/e2e/src/webpresso-host-adapter.ts',
      },
    })

    expect(config).toEqual({
      e2e: {
        hostAdapterModule: './apps/e2e/src/webpresso-host-adapter.ts',
      },
    })
  })
})

describe('validateWebpressoConfig', () => {
  it('accepts a root config without e2e settings', () => {
    expect(validateWebpressoConfig({}, '/repo/webpresso.config.ts')).toEqual({})
  })

  it('rejects invalid e2e config payloads', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          e2e: {
            hostAdapterExport: 'webpressoE2eHostAdapter',
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrow(WebpressoConfigValidationError)
  })
})
