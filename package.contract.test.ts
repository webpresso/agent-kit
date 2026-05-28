import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const CHANGESET_CONFIG_PATH = join(REPO_ROOT, '.changeset', 'config.json')
const NPMRC_PATH = join(REPO_ROOT, '.npmrc')
const PACKAGE_SURFACE_PATH = join(REPO_ROOT, 'package-surface.json')
const FORBIDDEN_TARBALL_PATHS = [
  /^dist\/.*\.map$/,
  /^dist\/.*__integration__\//,
  /^dist\/.*__mocks__\//,
  /^dist\/.*runners\/evals\//,
  /^dist\/esm\/ai-prompts\//,
]

let packedTarballArtifactCache:
  | {
      paths: string[]
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
  | undefined

function parseNpmJson<T>(raw: string): T {
  const start = raw.indexOf('[')
  if (start === -1) {
    throw new Error(`npm JSON output missing JSON payload: ${raw}`)
  }
  return JSON.parse(raw.slice(start)) as T
}

function readPackedTarballArtifact() {
  if (packedTarballArtifactCache) return packedTarballArtifactCache
  const raw = execFileSync('npm', ['pack', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '0',
    },
  })
  const entries = parseNpmJson<Array<{ filename?: string }>>(raw)
  const tarballName = entries[0]?.filename
  if (!tarballName) {
    throw new Error('npm pack did not return a tarball filename')
  }
  const tarballPath = join(REPO_ROOT, tarballName)
  try {
    const paths = execFileSync('tar', ['-tf', tarballPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^package\//, ''))
      .filter(Boolean)
    const manifest = execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    packedTarballArtifactCache = {
      ...(JSON.parse(manifest) as Omit<NonNullable<typeof packedTarballArtifactCache>, 'paths'>),
      paths,
    }
    return packedTarballArtifactCache
  } finally {
    rmSync(tarballPath, { force: true })
  }
}

function listPackedManifestCatalogSpecifiers(pkg: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}) {
  const sections = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const
  return sections.flatMap((section) =>
    Object.entries(pkg[section] ?? {})
      .filter(([, version]) => version.startsWith('catalog:'))
      .map(([name, version]) => `${section}.${name}=${version}`),
  )
}

describe('tooling umbrella package contract', () => {
  it('ships the tooling umbrella as scoped @webpresso/agent-kit on the public npm registry', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      name: string
      publishConfig?: { registry?: string; access?: string }
      scripts?: Record<string, string>
    }
    const changeset = JSON.parse(readFileSync(CHANGESET_CONFIG_PATH, 'utf8')) as {
      access?: string
    }

    expect(pkg.name).toBe('@webpresso/agent-kit')
    expect(pkg.publishConfig).toMatchObject({
      registry: 'https://registry.npmjs.org/',
      access: 'public',
    })
    expect(changeset.access).toBe('public')
    expect(pkg.scripts?.['release:publish']).toBe('bun scripts/release-publish.ts')
  })

  it('exports the canonical tooling subpaths needed by external consumers', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      exports?: Record<string, unknown>
    }
    const exports = pkg.exports ?? {}

    expect(exports).toHaveProperty('./vitest/node')
    expect(exports).toHaveProperty('./vitest/react')
    expect(exports).toHaveProperty('./vitest/workers')
    expect(exports).toHaveProperty('./tsconfig/base.json')
    expect(exports).toHaveProperty('./tsconfig/cloudflare.json')
    expect(exports).toHaveProperty('./tsconfig/react-library.json')
    expect(exports).toHaveProperty('./tsconfig/react-router.json')
    expect(exports).toHaveProperty('./stryker')
    expect(exports).toHaveProperty('./workers-test')
  })

  it('keeps checked-in npm config on the public registry path', () => {
    const npmrc = readFileSync(NPMRC_PATH, 'utf8')

    expect(npmrc).toContain('registry=https://registry.npmjs.org/')
    expect(npmrc).not.toContain('npm.pkg.github.com')
    expect(npmrc).not.toContain('GH_PACKAGES_TOKEN')
  })

  it('encodes the packed tarball denylist in the package-surface contract', () => {
    const contract = JSON.parse(readFileSync(PACKAGE_SURFACE_PATH, 'utf8')) as {
      tarball?: { forbiddenPathPatterns?: string[] }
    }

    expect(contract.tarball?.forbiddenPathPatterns ?? []).toEqual(
      expect.arrayContaining([
        '/^dist\\/.*\\.map$/',
        '/^dist\\/.*__integration__\\//',
        '/^dist\\/.*__mocks__\\//',
        '/^dist\\/.*runners\\/evals\\//',
        '/^dist\\/esm\\/ai-prompts\\//',
      ]),
    )
  })

  it(
    'packs no banned internal tarball artifacts',
    () => {
      const packedPaths = readPackedTarballArtifact().paths
      const banned = packedPaths.filter((path) =>
        FORBIDDEN_TARBALL_PATHS.some((pattern) => pattern.test(path)),
      )

      expect(banned).toEqual([])
    },
    30_000,
  )

  it(
    'packs a manifest with no workspace-only catalog specifiers',
    () => {
      const packedManifest = readPackedTarballArtifact()

      expect(listPackedManifestCatalogSpecifiers(packedManifest)).toEqual([])
    },
    30_000,
  )
})
