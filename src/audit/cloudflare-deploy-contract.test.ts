import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { auditCloudflareDeployContract } from './cloudflare-deploy-contract.js'

const tempDirs: string[] = []

function makeRepo(configBody: string, options: { writeMetadata?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wp-cloudflare-deploy-contract-'))
  tempDirs.push(root)
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', type: 'module' }),
    'utf8',
  )
  writeFileSync(path.join(root, 'webpresso.config.ts'), configBody, 'utf8')
  if (options.writeMetadata) {
    mkdirSync(path.join(root, 'infra'), { recursive: true })
    writeFileSync(
      path.join(root, 'infra/release-metadata.production.json'),
      JSON.stringify({
        releaseKind: 'version_pr',
        durableObjectMigration: 'none',
        rolloutMode: 'direct',
        requiredChecks: [],
      }),
      'utf8',
    )
  }
  return root
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('auditCloudflareDeployContract', () => {
  it('passes when no webpresso.config.ts is present', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'wp-cloudflare-deploy-contract-empty-'))
    tempDirs.push(root)
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer' }), 'utf8')
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })

  it('fails when the production release metadata file is missing', async () => {
    const root = makeRepo(`
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [],
          },
        },
      }
    `)
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(false)
    expect(result.violations?.[0]?.message).toContain('infra/release-metadata.production.json')
  })

  it('fails when a custom-domain target omits routeSpec', async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
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
      }
    `,
      { writeMetadata: true },
    )
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(false)
    expect(result.violations?.some((item) => item.message.includes('routeSpec'))).toBe(true)
  })

  it('fails when a DO target declares an empty durableObjectBindings array', async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'ingest-lens-api',
                previewTransport: 'workers_dev_env',
                durableObjectBindings: [],
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'gradual',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    )
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations?.some((item) => item.message.includes('no env-specific bindings')),
    ).toBe(true)
  })

  it('fails when a Durable Object target uses workers_dev_env', async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'ingest-lens-api',
                previewTransport: 'workers_dev_env',
                durableObjectBindings: [{ name: 'TOPIC_ROOMS', className: 'TopicRoom' }],
                vars: { ALLOWED_ORIGIN: 'https://preview-main.example.com' },
                requiredSecrets: ['DOPPLER_TOKEN'],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    )
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations?.some((item) => item.message.includes('must use previewTransport "custom_domain_env"')),
    ).toBe(true)
  })

  it('passes with metadata present and a valid custom-domain target', async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'edge-matte',
                previewTransport: 'custom_domain_env',
                routeSpec: { pattern: 'preview-main.example.com' },
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    )
    const result = await auditCloudflareDeployContract(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })
})
