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
            preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
            prd: {
              wranglerEnvName: 'production',
              deployedWorkerNameMode: 'top_level_name',
            },
          },
          production: {
            metadataPath: 'infra/release-metadata.production.json',
          },
          targets: [],
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
            preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
            prd: {
              wranglerEnvName: 'production',
              deployedWorkerNameMode: 'top_level_name',
            },
          },
          production: {
            metadataPath: 'infra/release-metadata.production.json',
          },
          targets: [],
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
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [],
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
            preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
            prd: {
              wranglerEnvName: 'production',
              deployedWorkerNameMode: 'top_level_name',
            },
          },
          production: {
            metadataPath: 'infra/release-metadata.production.json',
          },
          targets: [],
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
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [],
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
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'prd',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [],
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
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [],
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

  it('rejects preview_pr env-name patterns that are not dash-safe', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview_pr_<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.lanes.preview_pr.wranglerEnvNamePattern: wranglerEnvNamePattern must be dash-safe and end with -<n>.]
    `)
  })

  it('rejects production metadata paths that drift from the shared contract', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release.json',
              },
              targets: [],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.production.metadataPath: Invalid input: expected "infra/release-metadata.production.json"]
    `)
  })

  it('rejects custom-domain previews without routeSpec', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [
                {
                  id: 'api',
                  type: 'single_worker',
                  topLevelWorkerName: 'edge-matte',
                  previewTransport: 'custom_domain_env',
                  vars: {},
                  requiredSecrets: [],
                  storageMode: 'isolated',
                  destroyMode: 'wrangler_delete_env',
                  productionStrategyDefault: 'direct',
                },
              ],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.targets.0.routeSpec: routeSpec is required when previewTransport is "custom_domain_env".]
    `)
  })

  it('rejects shared_via_script_name targets without blastRadiusDoc', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [
                {
                  id: 'api',
                  type: 'single_worker',
                  topLevelWorkerName: 'ingest-lens-api',
                  previewTransport: 'workers_dev_env',
                  vars: {},
                  requiredSecrets: [],
                  storageMode: 'shared_via_script_name',
                  destroyMode: 'wrangler_delete_env',
                  productionStrategyDefault: 'gradual',
                },
              ],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.targets.0.blastRadiusDoc: blastRadiusDoc is required when storageMode is "shared_via_script_name".]
    `)
  })

  it('rejects Durable Object targets that use workers_dev_env preview transport', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [
                {
                  id: 'api',
                  type: 'single_worker',
                  topLevelWorkerName: 'ingest-lens-api',
                  previewTransport: 'workers_dev_env',
                  durableObjectBindings: [
                    {
                      name: 'TOPIC_ROOMS',
                      className: 'TopicRoom',
                    },
                  ],
                  vars: {
                    ALLOWED_ORIGIN: 'https://preview-main.example.com',
                  },
                  requiredSecrets: ['DOPPLER_TOKEN'],
                  storageMode: 'isolated',
                  destroyMode: 'wrangler_delete_env',
                  productionStrategyDefault: 'direct',
                },
              ],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.targets.0.previewTransport: Durable Object targets must use previewTransport "custom_domain_env" unless a future explicit exception contract is introduced.]
    `)
  })

  it('rejects Durable Object targets without env-specific vars and required secret names', () => {
    expect(() =>
      validateWebpressoConfig(
        {
          deploy: {
            cloudflare: {
              lanes: {
                dev: { wranglerEnvName: 'dev' },
                preview_main: { wranglerEnvName: 'preview-main' },
                preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
                prd: {
                  wranglerEnvName: 'production',
                  deployedWorkerNameMode: 'top_level_name',
                },
              },
              production: {
                metadataPath: 'infra/release-metadata.production.json',
              },
              targets: [
                {
                  id: 'api',
                  type: 'single_worker',
                  topLevelWorkerName: 'ingest-lens-api',
                  previewTransport: 'custom_domain_env',
                  routeSpec: { pattern: 'api.preview-main.example.com' },
                  durableObjectBindings: [
                    {
                      name: 'TOPIC_ROOMS',
                      className: 'TopicRoom',
                    },
                  ],
                  vars: {},
                  requiredSecrets: [],
                  storageMode: 'isolated',
                  destroyMode: 'wrangler_delete_env',
                  productionStrategyDefault: 'direct',
                },
              ],
            },
          },
        },
        '/repo/webpresso.config.ts',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`
      [WebpressoConfigValidationError: Invalid webpresso config at /repo/webpresso.config.ts:
        - deploy.cloudflare.targets.0.vars: Durable Object targets must declare at least one env-specific var.
        - deploy.cloudflare.targets.0.requiredSecrets: Durable Object targets must declare at least one required secret name.]
    `)
  })
})
