import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterAll, describe, expect, it } from 'vitest'

import { createInstalledBlueprintMigrationSmokeScript } from './scripts/packed-blueprint-migration-smoke.js'

const REPO_ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const DIST_SENTINEL = join(REPO_ROOT, 'dist', 'esm', 'index.js')
const MIGRATION_SENTINEL = join(
  REPO_ROOT,
  'dist',
  'esm',
  'blueprint',
  'db',
  'migrations',
  '0001_seed.sql',
)
const CHANGESET_CONFIG_PATH = join(REPO_ROOT, '.changeset', 'config.json')
const NPMRC_PATH = join(REPO_ROOT, '.npmrc')
const PACKAGE_SURFACE_PATH = join(REPO_ROOT, 'package-surface.json')
const BLUEPRINT_MIGRATIONS_SOURCE_DIR = join(REPO_ROOT, 'src', 'blueprint', 'db', 'migrations')
const EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES = readdirSync(BLUEPRINT_MIGRATIONS_SOURCE_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
const EXPECTED_BLUEPRINT_SCHEMA_VERSIONS = EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES.map((file) =>
  Number.parseInt(file.slice(0, file.indexOf('_')), 10),
)
const ORIGINAL_PACKAGE_JSON_TEXT = readFileSync(PACKAGE_JSON_PATH, 'utf8')
const FORBIDDEN_TARBALL_PATHS = [
  /^dist\/.*\.map$/,
  /^dist\/.*__integration__\//,
  /^dist\/.*__mocks__\//,
  /^dist\/.*runners\/evals\//,
  /^dist\/esm\/ai-prompts\//,
]

type PackedTarballArtifact = {
  tarballPath: string
  paths: string[]
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

let packedTarballArtifactCache: PackedTarballArtifact | undefined
let packedDistBuilt = false

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

function parseNpmJson<T>(raw: string): T {
  const start = raw.indexOf('[')
  if (start === -1) {
    throw new Error(`npm JSON output missing JSON payload: ${raw}`)
  }
  return JSON.parse(raw.slice(start)) as T
}

function ensureBuiltPackedDist() {
  if (packedDistBuilt) return
  // globalSetup runs tshy + normalize before workers fork; skip if already built.
  if (!existsSync(DIST_SENTINEL)) {
    execFileSync('./node_modules/.bin/tshy', [], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HUSKY: '0',
      },
    })
    execFileSync('bun', ['src/build/normalize-tsconfig-json-exports.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HUSKY: '0',
      },
    })
  }
  if (!existsSync(MIGRATION_SENTINEL)) {
    execFileSync('bun', ['src/build/blueprint-migration-assets.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HUSKY: '0',
      },
    })
  }
  execFileSync('bun', ['scripts/chmod-bins.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '0',
    },
  })
  execFileSync('bun', ['scripts/link-self-bins.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '0',
    },
  })
  packedDistBuilt = true
}

function ensurePackedTarballArtifact() {
  if (packedTarballArtifactCache) return packedTarballArtifactCache
  ensureBuiltPackedDist()
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
    ...(JSON.parse(manifest) as Omit<PackedTarballArtifact, 'paths' | 'tarballPath'>),
    tarballPath,
    paths,
  }
  return packedTarballArtifactCache
}

function readPackedTarballArtifact() {
  return ensurePackedTarballArtifact()
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

function createPackedTarball(): { tarballPath: string; cleanup: () => void } {
  const artifact = ensurePackedTarballArtifact()
  return {
    tarballPath: artifact.tarballPath,
    cleanup: () => {},
  }
}

afterAll(() => {
  if (packedTarballArtifactCache) {
    rmSync(packedTarballArtifactCache.tarballPath, { force: true })
    packedTarballArtifactCache = undefined
  }
  if (readFileSync(PACKAGE_JSON_PATH, 'utf8') !== ORIGINAL_PACKAGE_JSON_TEXT) {
    // Atomic restore: concurrent bun processes must never see a truncated package.json.
    const tmpPath = `${PACKAGE_JSON_PATH}.writing`
    writeFileSync(tmpPath, ORIGINAL_PACKAGE_JSON_TEXT)
    renameSync(tmpPath, PACKAGE_JSON_PATH)
  }
})

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

  it('packs no banned internal tarball artifacts', () => {
    const packedPaths = readPackedTarballArtifact().paths
    const banned = packedPaths.filter((path) =>
      FORBIDDEN_TARBALL_PATHS.some((pattern) => pattern.test(path)),
    )

    expect(banned).toEqual([])
    expect(packedPaths).toContain('bin/wp')
    expect(packedPaths).not.toContain('bin/wp.js')
  }, 30_000)

  it('packs a manifest with no workspace-only catalog specifiers', () => {
    const packedManifest = readPackedTarballArtifact()

    expect(listPackedManifestCatalogSpecifiers(packedManifest)).toEqual([])
  }, 30_000)

  it('packs the built blueprint migration SQL assets under dist/esm', () => {
    const packedPaths = readPackedTarballArtifact().paths

    for (const file of EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES) {
      expect(packedPaths).toContain(`dist/esm/blueprint/db/migrations/${file}`)
    }
  }, 30_000)

  it('packed consumers receive runtime-owned setup guidance without losing authoring deps', () => {
    const { tarballPath, cleanup } = createPackedTarball()
    const tmpRoot = mkdtempSync(join(tmpdir(), 'wp-packed-consumer-'))
    const launcherRoot = mkdtempSync(join(tmpdir(), 'wp-packed-launcher-'))
    const packedPackageRoot = join(launcherRoot, 'package')
    const fakeHome = join(tmpRoot, '.home')
    const fakeCodexHome = join(tmpRoot, '.codex-home')

    try {
      execFileSync('git', ['init', '-q'], { cwd: tmpRoot, encoding: 'utf8' })
      execFileSync('git', ['init', '-q'], { cwd: launcherRoot, encoding: 'utf8' })
      execFileSync('tar', ['-xzf', tarballPath, '-C', launcherRoot], { encoding: 'utf8' })
      symlinkSync(
        join(REPO_ROOT, 'node_modules'),
        join(packedPackageRoot, 'node_modules'),
        'junction',
      )
      writeFileSync(
        join(tmpRoot, 'package.json'),
        JSON.stringify(
          {
            name: 'packed-consumer-smoke',
            private: true,
            devDependencies: {
              vitest: '^2.1.0',
              '@playwright/test': '^1.55.0',
              oxlint: '^1.0.0',
              oxfmt: '^1.0.0',
            },
          },
          null,
          2,
        ) + '\n',
      )

      chmodSync(join(packedPackageRoot, 'bin', 'wp'), 0o755)

      const output = execFileSync(
        join(packedPackageRoot, 'bin', 'wp'),
        ['setup', '--yes', '--cwd', tmpRoot],
        {
          cwd: launcherRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI: '1',
            CODEX_HOME: fakeCodexHome,
            HOME: fakeHome,
            HUSKY: '0',
            WP_SKIP_CLAUDE_PLUGIN: '1',
            WP_SKIP_CONTEXT_MODE: '1',
            WP_SKIP_GSTACK: '1',
            WP_SKIP_OMC: '1',
            WP_SKIP_RTK: '1',
            WP_SKIP_UPDATE_CHECK: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      expect(output).toContain('Runtime-owned tooling contract:')
      expect(output).toContain('wp now owns execution for test, e2e, lint, format, and typecheck.')
      expect(output).toContain(
        'Keep local authoring deps when imported directly: vitest, @playwright/test',
      )
      expect(output).toContain(
        'Review execution-only deps for removal if they only powered local binaries: oxlint, oxfmt',
      )
      expect(output).toContain(
        'Do not blanket-remove devDependencies just because wp can execute the tool.',
      )
    } finally {
      cleanup()
      rmSync(launcherRoot, { force: true, recursive: true })
      rmSync(tmpRoot, { force: true, recursive: true })
    }
  }, 120_000)

  it('installed packed consumers can execute blueprint DB migrations from the packaged dist asset path', () => {
    const { tarballPath, cleanup } = createPackedTarball()
    const tmpRoot = mkdtempSync(join(tmpdir(), 'wp-packed-migration-consumer-'))

    try {
      writeFileSync(
        join(tmpRoot, 'package.json'),
        JSON.stringify({ name: 'packed-migration-smoke', private: true }, null, 2) + '\n',
      )
      execFileSync('npm', ['install', tarballPath], {
        cwd: tmpRoot,
        encoding: 'utf8',
        env: { ...process.env, HUSKY: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const packageRoot = join(tmpRoot, 'node_modules', '@webpresso', 'agent-kit')
      const smokeOutput = execFileSync(
        'node',
        [
          '--input-type=module',
          '--eval',
          createInstalledBlueprintMigrationSmokeScript({
            packageRoot,
            expectedSqlFiles: EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES,
            expectedVersions: EXPECTED_BLUEPRINT_SCHEMA_VERSIONS,
          }),
        ],
        {
          cwd: tmpRoot,
          encoding: 'utf8',
          env: { ...process.env, HUSKY: '0' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      expect(smokeOutput).toContain('"versions"')
      expect(smokeOutput).toContain('"0001_seed.sql"')
    } finally {
      cleanup()
      rmSync(tmpRoot, { force: true, recursive: true })
    }
  }, 120_000)
})
