import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const CHANGESET_CONFIG_PATH = join(REPO_ROOT, '.changeset', 'config.json')
const NPMRC_PATH = join(REPO_ROOT, '.npmrc')
const PACKAGE_SURFACE_PATH = join(REPO_ROOT, 'package-surface.json')
const BLUEPRINT_MIGRATIONS_SOURCE_DIR = join(REPO_ROOT, 'src', 'blueprint', 'db', 'migrations')

function collectExportTypeTargets(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  const current =
    typeof (value as { types?: unknown }).types === 'string'
      ? [(value as { types: string }).types]
      : []

  return current.concat(
    ...Object.values(value as Record<string, unknown>).map((nested) =>
      collectExportTypeTargets(nested),
    ),
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

    expect(exports).toHaveProperty('./bundle')
    expect(exports).toHaveProperty('./vitest/node')
    expect(exports).toHaveProperty('./vitest/react')
    expect(exports).toHaveProperty('./vitest/workers')
    expect(exports).toHaveProperty('./tsconfig/base.json')
    expect(exports).toHaveProperty('./tsconfig/cloudflare.json')
    expect(exports).toHaveProperty('./tsconfig/react-library.json')
    expect(exports).toHaveProperty('./tsconfig/react-router.json')
    expect(exports).toHaveProperty('./stryker')
    expect(exports).toHaveProperty('./workers-test')
    expect(exports).toHaveProperty('./wp-extension')
  })

  it('never advertises non-declaration files as export type targets', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      exports?: Record<string, unknown>
    }

    const badTypeTargets = Object.entries(pkg.exports ?? {}).flatMap(([subpath, entry]) =>
      collectExportTypeTargets(entry)
        .filter((target) => !/\.d\.(?:cts|mts|ts)$/u.test(target))
        .map((target) => `${subpath} -> ${target}`),
    )

    expect(badTypeTargets).toEqual([])
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

  it('keeps blueprint migration source versions parseable for packaged assets', () => {
    const migrationVersions = readdirSync(BLUEPRINT_MIGRATIONS_SOURCE_DIR)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => Number.parseInt(file.slice(0, file.indexOf('_')), 10))

    expect(migrationVersions).not.toContain(Number.NaN)
    expect(migrationVersions).toContain(1)
  })
})
