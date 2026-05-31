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
      deploy: {
        cloudflare: {
          lanes: {
            dev: { wranglerEnvName: 'dev' },
            preview_main: { wranglerEnvName: 'preview-main' },
            preview_pr: { wranglerEnvName: 'preview-pr' },
            prd: { wranglerEnvName: 'production' },
          },
        },
      },
    })

    expect(config).toEqual({
      e2e: {
        hostAdapterModule: './apps/e2e/src/webpresso-host-adapter.ts',
      },
      deploy: {
        cloudflare: {
          lanes: {
            dev: { wranglerEnvName: 'dev' },
            preview_main: { wranglerEnvName: 'preview-main' },
            preview_pr: { wranglerEnvName: 'preview-pr' },
            prd: { wranglerEnvName: 'production' },
          },
        },
      },
    })
  })
})

describe('validateWebpressoConfig', () => {
  it('accepts a root config without e2e settings', () => {
    expect(validateWebpressoConfig({}, '/repo/webpresso.config.ts')).toEqual({})
  })

  it('accepts the shared Cloudflare deploy config surface', () => {
    expect(
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvName: 'preview-pr' },
                prd: { wranglerEnvName: 'production' },
              },
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toEqual({
      deploy: {
        cloudflare: {
          lanes: {
            dev: { wranglerEnvName: 'dev' },
            preview_main: { wranglerEnvName: 'preview-main' },
            preview_pr: { wranglerEnvName: 'preview-pr' },
            prd: { wranglerEnvName: 'production' },
          },
        },
      },
    })
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

  it('rejects non dash-safe Cloudflare env names', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev_env' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvName: 'preview-pr' },
                prd: { wranglerEnvName: 'production' },
              },
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.lanes.dev.wranglerEnvName: wranglerEnvName must be dash-safe lowercase letters, numbers, and hyphens only.]
    `)
  })

  it('rejects prd lane env names that are not production', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvName: 'preview-pr' },
                prd: { wranglerEnvName: 'prd' },
              },
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.lanes.prd.wranglerEnvName: deploy.cloudflare.lanes.prd.wranglerEnvName must be "production".]
    `)
  })

  it('rejects partial Cloudflare lane declarations', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                prd: { wranglerEnvName: 'production' },
              },
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.lanes.preview_pr: Invalid input: expected object, received undefined]
    `)
  })
})
