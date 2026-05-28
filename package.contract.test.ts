import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const NPMRC_PATH = join(REPO_ROOT, '.npmrc')
const PACKAGE_SURFACE_PATH = join(REPO_ROOT, 'package-surface.json')
const FORBIDDEN_TARBALL_PATHS = [
  /^dist\/.*\.map$/,
  /^dist\/.*__integration__\//,
  /^dist\/.*__mocks__\//,
  /^dist\/.*runners\/evals\//,
  /^dist\/esm\/ai-prompts\//,
]

let packedTarballPathsCache: string[] | undefined
let packedManifestCache:
  | {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
  | undefined

function readPackedTarballPaths() {
  if (packedTarballPathsCache) return packedTarballPathsCache
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  const entries = JSON.parse(raw) as Array<{ files?: Array<{ path?: string }> }>
  packedTarballPathsCache =
    entries[0]?.files
      ?.map((file) => file.path)
      .filter((path): path is string => typeof path === 'string') ?? []
  return packedTarballPathsCache
}

function readPackedPackageManifest() {
  if (packedManifestCache) return packedManifestCache
  const raw = execFileSync('npm', ['pack', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  const entries = JSON.parse(raw) as Array<{ filename?: string }>
  const tarballName = entries[0]?.filename
  if (!tarballName) {
    throw new Error('npm pack did not return a tarball filename')
  }
  const tarballPath = join(REPO_ROOT, tarballName)
  try {
    const manifest = execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    packedManifestCache = JSON.parse(manifest) as typeof packedManifestCache
    return packedManifestCache
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
    }

    expect(pkg.name).toBe('@webpresso/agent-kit')
    expect(pkg.publishConfig).toMatchObject({
      registry: 'https://registry.npmjs.org/',
      access: 'public',
    })
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

  it('packs no banned internal tarball artifacts', () => {
    const packedPaths = readPackedTarballPaths()
    const banned = packedPaths.filter((path) =>
      FORBIDDEN_TARBALL_PATHS.some((pattern) => pattern.test(path)),
    )

    expect(banned).toEqual([])
  })

  it('packs a manifest with no workspace-only catalog specifiers', () => {
    const packedManifest = readPackedPackageManifest()

    expect(listPackedManifestCatalogSpecifiers(packedManifest)).toEqual([])
  })
})
