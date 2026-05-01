import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditBucketBoundary } from './bucket-boundary.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join('/tmp', `bucket-boundary-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writePackageJson(
  pkgDir: string,
  content: Record<string, unknown>,
): Promise<void> {
  await mkdir(pkgDir, { recursive: true })
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify(content, null, 2))
}

async function writeWranglerJsonc(dir: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'wrangler.jsonc'), content)
}

async function writePnpmWorkspace(root: string, packages: string[]): Promise<void> {
  const yaml = `packages:\n${packages.map((p) => `  - '${p}'`).join('\n')}\n`
  await writeFile(join(root, 'pnpm-workspace.yaml'), yaml)
}

describe('auditBucketBoundary', () => {
  it('returns ok with no violations when no packages exist', async () => {
    await writePnpmWorkspace(tmpDir, [])
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('returns ok when packages have no bucket annotation', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/foo'), {
      name: '@test/foo',
      dependencies: { '@test/bar': 'workspace:*' },
    })
    await writePackageJson(join(tmpDir, 'packages/bar'), {
      name: '@test/bar',
    })
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('returns ok when platform depends on platform', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/api'), {
      name: '@test/api',
      webpresso: { bucket: 'platform' },
      dependencies: { '@test/utils': 'workspace:*' },
    })
    await writePackageJson(join(tmpDir, 'packages/utils'), {
      name: '@test/utils',
      webpresso: { bucket: 'platform' },
    })
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('reports violation when tenant-orchestration depends on platform', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
      dependencies: { '@test/platform-api': 'workspace:*' },
    })
    await writePackageJson(join(tmpDir, 'packages/platform-api'), {
      name: '@test/platform-api',
      webpresso: { bucket: 'platform' },
    })
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].message).toMatch(/tenant-orchestration.*platform|cross-bucket/)
  })

  it('reports violation in devDependencies too', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
      devDependencies: { '@test/platform-lib': 'workspace:*' },
    })
    await writePackageJson(join(tmpDir, 'packages/platform-lib'), {
      name: '@test/platform-lib',
      webpresso: { bucket: 'platform' },
    })
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations[0].message).toMatch(/@test\/platform-lib/)
  })

  it('does not flag platform depending on tenant-orchestration (only one direction is forbidden)', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/platform'), {
      name: '@test/platform',
      webpresso: { bucket: 'platform' },
      dependencies: { '@test/orchestrator': 'workspace:*' },
    })
    await writePackageJson(join(tmpDir, 'packages/orchestrator'), {
      name: '@test/orchestrator',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    // platform -> tenant-orchestration is not a forbidden direction per spec
    // (only tenant-orchestration -> platform is forbidden)
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(true)
  })

  it('reports wrangler service binding violation across buckets', async () => {
    await writePnpmWorkspace(tmpDir, ['apps/*'])
    await writePackageJson(join(tmpDir, 'apps/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'apps/platform-api'), {
      name: '@test/platform-api',
      webpresso: { bucket: 'platform' },
    })
    await writeWranglerJsonc(
      join(tmpDir, 'apps/chef'),
      JSON.stringify({
        name: 'chef',
        services: [{ binding: 'PLATFORM', service: 'platform-api' }],
      }),
    )
    await writeWranglerJsonc(
      join(tmpDir, 'apps/platform-api'),
      JSON.stringify({ name: 'platform-api' }),
    )
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.message.includes('platform-api'))).toBe(true)
  })

  it('allows wrangler service binding within the same bucket', async () => {
    await writePnpmWorkspace(tmpDir, ['apps/*'])
    await writePackageJson(join(tmpDir, 'apps/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'apps/dispatch'), {
      name: '@test/dispatch',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writeWranglerJsonc(
      join(tmpDir, 'apps/chef'),
      JSON.stringify({
        name: 'chef',
        services: [{ binding: 'DISPATCH', service: 'dispatch' }],
      }),
    )
    await writeWranglerJsonc(
      join(tmpDir, 'apps/dispatch'),
      JSON.stringify({ name: 'dispatch' }),
    )
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(true)
  })

  it('handles JSONC with line comments and trailing commas', async () => {
    await writePnpmWorkspace(tmpDir, ['apps/*'])
    await writePackageJson(join(tmpDir, 'apps/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'apps/platform-api'), {
      name: '@test/platform-api',
      webpresso: { bucket: 'platform' },
    })
    // JSONC with comments and trailing commas
    const jsonc = `{
  // This is a comment
  "name": "chef",
  "services": [
    { "binding": "PLATFORM", "service": "platform-api", }, // trailing comma
  ],
}`
    await writeWranglerJsonc(join(tmpDir, 'apps/chef'), jsonc)
    await writeWranglerJsonc(
      join(tmpDir, 'apps/platform-api'),
      JSON.stringify({ name: 'platform-api' }),
    )
    const result = await auditBucketBoundary(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.message.includes('platform-api'))).toBe(true)
  })

  it('respects crossBucketBindings allowlist in wrangler', async () => {
    await writePnpmWorkspace(tmpDir, ['apps/*'])
    await writePackageJson(join(tmpDir, 'apps/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'apps/platform-api'), {
      name: '@test/platform-api',
      webpresso: { bucket: 'platform' },
    })
    const wrangler = {
      name: 'chef',
      services: [{ binding: 'PLATFORM', service: 'platform-api' }],
      webpresso: {
        crossBucketBindings: ['platform-api'],
      },
    }
    await writeWranglerJsonc(join(tmpDir, 'apps/chef'), JSON.stringify(wrangler))
    await writeWranglerJsonc(
      join(tmpDir, 'apps/platform-api'),
      JSON.stringify({ name: 'platform-api' }),
    )
    const result = await auditBucketBoundary(tmpDir, { strict: false })
    // In non-strict mode, allowlisted cross-bucket binding is a warning, not error
    const errors = result.violations.filter((v) => v.message.includes('error'))
    expect(errors).toHaveLength(0)
  })

  it('--strict makes all violations errors regardless of allowlist', async () => {
    await writePnpmWorkspace(tmpDir, ['apps/*'])
    await writePackageJson(join(tmpDir, 'apps/chef'), {
      name: '@test/chef',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'apps/platform-api'), {
      name: '@test/platform-api',
      webpresso: { bucket: 'platform' },
    })
    const wrangler = {
      name: 'chef',
      services: [{ binding: 'PLATFORM', service: 'platform-api' }],
      webpresso: { crossBucketBindings: ['platform-api'] },
    }
    await writeWranglerJsonc(join(tmpDir, 'apps/chef'), JSON.stringify(wrangler))
    await writeWranglerJsonc(
      join(tmpDir, 'apps/platform-api'),
      JSON.stringify({ name: 'platform-api' }),
    )
    const result = await auditBucketBoundary(tmpDir, { strict: true })
    expect(result.ok).toBe(false)
  })

  it('checked count reflects number of annotated packages inspected', async () => {
    await writePnpmWorkspace(tmpDir, ['packages/*'])
    await writePackageJson(join(tmpDir, 'packages/a'), {
      name: '@test/a',
      webpresso: { bucket: 'platform' },
    })
    await writePackageJson(join(tmpDir, 'packages/b'), {
      name: '@test/b',
      webpresso: { bucket: 'tenant-orchestration' },
    })
    await writePackageJson(join(tmpDir, 'packages/c'), {
      name: '@test/c',
      // no bucket annotation
    })
    const result = await auditBucketBoundary(tmpDir)
    expect(result.checked).toBeGreaterThanOrEqual(2)
  })
})
