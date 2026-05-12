/**
 * Unit tests for the pure staging-dir logic in scripts/publish-webpresso.ts.
 *
 * Covers D12: name, publishConfig, bin map (9 entries), preferGlobal.
 * Covers D21: registry probe short-circuit (200 → skip, 404 → proceed).
 *
 * No file system writes. Fetch is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildStagingPackageJson,
  isAlreadyPublished,
  readCanonicalPackageJson,
} from './publish-webpresso.ts'

const HOOK_BINS = [
  'ak-pretool-guard',
  'ak-post-tool',
  'ak-stop-qa',
  'ak-guard-switch',
  'ak-test-quality-check',
  'ak-sessionstart-routing',
  'ak-check-dev-link',
  'ak-restore-dev-links',
] as const

const MINIMAL_CANONICAL = {
  name: '@webpresso/agent-kit',
  version: '0.16.0',
  description: 'agent-kit',
  license: 'MIT',
  files: ['dist', 'src', 'catalog'],
  publishConfig: {
    registry: 'https://npm.pkg.github.com',
    access: 'restricted',
  },
  bin: {
    ak: './src/cli/cli.ts',
    'ak-pretool-guard': './src/hooks/pretool-guard/index.ts',
    'ak-post-tool': './src/hooks/post-tool/lint-after-edit.ts',
    'ak-stop-qa': './src/hooks/stop/qa-changed-files.ts',
    'ak-guard-switch': './src/hooks/guard-switch/index.ts',
    'ak-test-quality-check': './src/hooks/test-quality-check.ts',
    'ak-sessionstart-routing': './src/hooks/sessionstart/index.ts',
    'ak-check-dev-link': './src/hooks/check-dev-link/index.ts',
    'ak-restore-dev-links': './src/dev/restore-dev-links/index.ts',
  },
}

describe('buildStagingPackageJson', () => {
  it('sets name to "webpresso"', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    expect(result.name).toBe('webpresso')
  })

  it('sets publishConfig.registry to public npmjs.org', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const pc = result.publishConfig as Record<string, string>
    expect(pc.registry).toBe('https://registry.npmjs.org')
    expect(pc.access).toBe('public')
  })

  it('sets preferGlobal to true', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    expect(result.preferGlobal).toBe(true)
  })

  it('includes "wp" bin entry pointing to cli.ts', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const bin = result.bin as Record<string, string>
    expect(bin['wp']).toBe('./src/cli/cli.ts')
  })

  it('includes "webpresso" bin entry pointing to cli.ts', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const bin = result.bin as Record<string, string>
    expect(bin['webpresso']).toBe('./src/cli/cli.ts')
  })

  it('includes "ak" bin entry pointing to cli.ts', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const bin = result.bin as Record<string, string>
    expect(bin['ak']).toBe('./src/cli/cli.ts')
  })

  it('includes all 8 hook bins from canonical', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const bin = result.bin as Record<string, string>
    for (const hookBin of HOOK_BINS) {
      expect(bin[hookBin], `missing hook bin: ${hookBin}`).toStrictEqual(
        MINIMAL_CANONICAL.bin[hookBin],
      )
    }
  })

  it('includes exactly 11 bin entries (wp + webpresso + ak + 8 hook bins)', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    const bin = result.bin as Record<string, string>
    expect(Object.keys(bin)).toHaveLength(11) // wp + webpresso + ak + 8 hooks = 11
  })

  it('copies files array verbatim from canonical', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    expect(result.files).toStrictEqual(MINIMAL_CANONICAL.files)
  })

  it('preserves other canonical fields (description, license)', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    expect(result.description).toBe(MINIMAL_CANONICAL.description)
    expect(result.license).toBe(MINIMAL_CANONICAL.license)
  })

  it('does not expose the old @webpresso scope in name', () => {
    const result = buildStagingPackageJson(MINIMAL_CANONICAL)
    expect((result.name as string).startsWith('@')).toBe(false)
  })

  it('throws when a hook bin is missing from canonical', () => {
    const missingBin = { ...MINIMAL_CANONICAL, bin: { ak: './src/cli/cli.ts' } }
    expect(() => buildStagingPackageJson(missingBin)).toThrow('ak-pretool-guard')
  })
})

describe('readCanonicalPackageJson', () => {
  it('returns an object with version and bin fields from the real package.json', async () => {
    const pkg = await readCanonicalPackageJson()
    expect(typeof pkg.version).toBe('string')
    expect(pkg.version.length).toBeGreaterThan(0)
    expect(pkg.bin).toBeTruthy()
    expect(typeof pkg.bin).toBe('object')
  })

  it('reads the canonical name as @webpresso/agent-kit', async () => {
    const pkg = await readCanonicalPackageJson()
    expect(pkg.name).toBe('@webpresso/agent-kit')
  })
})

describe('isAlreadyPublished — registry probe (D21)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when registry responds 200 (already published)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))
    const result = await isAlreadyPublished('1.2.3')
    expect(result).toBe(true)
  })

  it('returns false when registry responds 404 (not yet published)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
    const result = await isAlreadyPublished('1.2.3')
    expect(result).toBe(false)
  })

  it('returns false when fetch throws (network error → proceed with publish)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const result = await isAlreadyPublished('1.2.3')
    expect(result).toBe(false)
  })

  it('probes the correct npmjs.org URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
    await isAlreadyPublished('0.99.0')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://registry.npmjs.org/webpresso/0.99.0',
    )
  })
})
