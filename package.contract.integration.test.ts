import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createInstalledBlueprintMigrationSmokeScript } from './scripts/packed-blueprint-migration-smoke.js'
import { resolveRuntimeTarget, runtimePackageDirName } from './src/build/runtime-targets.js'
import { probeRuntimeTypecheckParity } from './src/typecheck/runtime-parity.js'

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
const BLUEPRINT_MIGRATIONS_SOURCE_DIR = join(REPO_ROOT, 'src', 'blueprint', 'db', 'migrations')
const EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES = readdirSync(BLUEPRINT_MIGRATIONS_SOURCE_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
const EXPECTED_BLUEPRINT_SCHEMA_VERSIONS = EXPECTED_BLUEPRINT_MIGRATION_SQL_FILES.map((file) =>
  Number.parseInt(file.slice(0, file.indexOf('_')), 10),
)
const ORIGINAL_PACKAGE_JSON_TEXT = readFileSync(PACKAGE_JSON_PATH, 'utf8')
const PACK_LOCK_DIRECTORY = join(tmpdir(), 'webpresso-agent-kit-npm-pack.lock')

function acquirePackLock(): () => void {
  const started = Date.now()
  while (true) {
    try {
      mkdirSync(PACK_LOCK_DIRECTORY)
      return () => rmSync(PACK_LOCK_DIRECTORY, { force: true, recursive: true })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'EEXIST') throw error
      const ageMs = Date.now() - statSync(PACK_LOCK_DIRECTORY).mtimeMs
      if (ageMs > 120_000) {
        rmSync(PACK_LOCK_DIRECTORY, { force: true, recursive: true })
        continue
      }
      if (Date.now() - started > 60_000) {
        throw new Error(`Timed out waiting for npm pack lock at ${PACK_LOCK_DIRECTORY}`)
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
}

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
let packedNativeRuntimeBuilt = false

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
  packedDistBuilt = true
}

function ensureBuiltNativeRuntimeArtifacts() {
  if (packedNativeRuntimeBuilt) return
  ensureBuiltPackedDist()
  execFileSync('bun', ['scripts/build-runtime-binaries.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '0',
    },
  })
  execFileSync('bun', ['scripts/stage-plugin-runtime-artifacts.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUSKY: '0',
    },
  })
  packedNativeRuntimeBuilt = true
}

function ensurePackedTarballArtifact() {
  if (packedTarballArtifactCache) return packedTarballArtifactCache
  ensureBuiltPackedDist()
  const release = acquirePackLock()
  let raw: string
  try {
    raw = execFileSync('npm', ['pack', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HUSKY: '0',
      },
    })
  } finally {
    release()
  }
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

function createHostRuntimeTarball(tempRoot: string): { tarballPath: string } {
  ensureBuiltNativeRuntimeArtifacts()
  const target = resolveRuntimeTarget()
  if (!target) {
    throw new Error(`No compiled host runtime target for ${process.platform}/${process.arch}`)
  }
  const packageRoot = join(
    REPO_ROOT,
    'dist',
    'runtime-packages',
    runtimePackageDirName(target.packageName),
  )
  const raw = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', tempRoot],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HUSKY: '0',
      },
    },
  )
  const entries = parseNpmJson<Array<{ filename?: string }>>(raw)
  const tarballName = entries[0]?.filename
  if (!tarballName) {
    throw new Error('npm pack did not return a host runtime tarball filename')
  }
  return { tarballPath: join(tempRoot, tarballName) }
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

describe('tooling umbrella package integration contract', () => {
  it('packs no banned internal tarball artifacts', () => {
    const packedPaths = readPackedTarballArtifact().paths
    const banned = packedPaths.filter((path) =>
      FORBIDDEN_TARBALL_PATHS.some((pattern) => pattern.test(path)),
    )

    expect(banned).toEqual([])
    expect(packedPaths).toContain('bin/wp')
    expect(packedPaths).not.toContain('bin/wp.js')
    expect(
      packedPaths.some((path) => path.startsWith(['native', 'session-memory-engine'].join('/'))),
    ).toBe(false)
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
      execFileSync('npm', ['install', '--omit=dev', '--omit=optional', '--ignore-scripts'], {
        cwd: packedPackageRoot,
        encoding: 'utf8',
        env: { ...process.env, HUSKY: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      writeFileSync(
        join(tmpRoot, 'package.json'),
        JSON.stringify(
          {
            name: 'packed-consumer-smoke',
            private: true,
            devDependencies: {
              '@webpresso/agent-config': '^0.1.5',
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
        'Keep local authoring deps when imported directly: @changesets/cli, vitest, @playwright/test, typescript',
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
      execFileSync('npm', ['install', tarballPath, '--omit=optional'], {
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

  it('packed global installs keep bare wp typecheck targeting aligned with the host runtime package', () => {
    const { tarballPath, cleanup } = createPackedTarball()
    const tmpRoot = mkdtempSync(join(tmpdir(), 'wp-packed-global-typecheck-'))
    const fakeHome = join(tmpRoot, 'home')
    const globalPrefix = join(fakeHome, '.vite-plus')
    const { tarballPath: runtimeTarballPath } = createHostRuntimeTarball(tmpRoot)

    try {
      const env = {
        ...process.env,
        HOME: fakeHome,
        HUSKY: '0',
        WP_SKIP_UPDATE_CHECK: '1',
        npm_config_prefix: globalPrefix,
        PATH: [join(globalPrefix, 'bin'), globalPrefix, process.env.PATH ?? ''].join(delimiter),
      }

      execFileSync('npm', ['install', '--global', runtimeTarballPath], {
        cwd: tmpRoot,
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      execFileSync('npm', ['install', '--global', tarballPath], {
        cwd: tmpRoot,
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const probe = probeRuntimeTypecheckParity({
        command: 'wp',
        env,
      })

      expect(probe.ok).toBe(true)
      expect(probe.helpOutput).toContain('--file')
      expect(probe.helpOutput).toContain('--package')
      expect(probe.fileOutput).toContain('Resolved typecheck scopes: @parity/root, @parity/widget')
    } finally {
      cleanup()
      rmSync(tmpRoot, { force: true, recursive: true })
    }
  }, 300_000)
})
