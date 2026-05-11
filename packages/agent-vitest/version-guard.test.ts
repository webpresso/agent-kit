import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const originalCwd = process.cwd()
const originalArgv = [...process.argv]
const originalNpmPackageJson = process.env.npm_package_json
const versionGuardModuleUrl = new URL('./version-guard.ts', import.meta.url).href
const workersModuleUrl = new URL('./workers.ts', import.meta.url).href

let moduleNonce = 0
const tempDirs: string[] = []

const importFresh = async <T>(moduleUrl: string): Promise<T> => {
  vi.resetModules()
  moduleNonce += 1
  return (await import(`${moduleUrl}?fixture=${moduleNonce}`)) as T
}

const createPackageFixture = ({
  packageName,
  vitestVersion,
  withWorkersPool,
}: {
  packageName: string
  vitestVersion: string
  withWorkersPool: boolean
}): string => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'version-guard-'))
  tempDirs.push(fixtureDir)

  mkdirSync(join(fixtureDir, 'node_modules', 'vitest'), { recursive: true })
  writeFileSync(
    join(fixtureDir, 'node_modules', 'vitest', 'package.json'),
    JSON.stringify({ name: 'vitest', version: vitestVersion }, null, 2),
  )
  writeFileSync(
    join(fixtureDir, 'package.json'),
    JSON.stringify(
      {
        name: packageName,
        private: true,
        devDependencies: {
          vitest: `^${vitestVersion}`,
          ...(withWorkersPool ? { '@cloudflare/vitest-pool-workers': '^0.14.1' } : {}),
        },
      },
      null,
      2,
    ),
  )

  return fixtureDir
}

const createWorkspaceFixture = ({
  packageName,
  rootVitestVersion,
  packageVitestVersion,
}: {
  packageName: string
  rootVitestVersion: string
  packageVitestVersion: string
}): { configPath: string; packageDir: string; workspaceDir: string } => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'version-guard-workspace-'))
  const packageDir = join(workspaceDir, 'packages', 'consumer')
  const configPath = join(packageDir, 'vitest.config.ts')
  tempDirs.push(workspaceDir)

  mkdirSync(join(workspaceDir, 'node_modules', 'vitest'), { recursive: true })
  mkdirSync(join(packageDir, 'node_modules', 'vitest'), { recursive: true })

  writeFileSync(
    join(workspaceDir, 'node_modules', 'vitest', 'package.json'),
    JSON.stringify({ name: 'vitest', version: rootVitestVersion }, null, 2),
  )
  writeFileSync(
    join(packageDir, 'node_modules', 'vitest', 'package.json'),
    JSON.stringify({ name: 'vitest', version: packageVitestVersion }, null, 2),
  )
  writeFileSync(
    join(workspaceDir, 'package.json'),
    JSON.stringify(
      { name: '@repo/root', private: true, devDependencies: { vitest: `^${rootVitestVersion}` } },
      null,
      2,
    ),
  )
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify(
      { name: packageName, private: true, devDependencies: { vitest: `^${packageVitestVersion}` } },
      null,
      2,
    ),
  )
  writeFileSync(configPath, 'export default {};\n')

  return { configPath, packageDir, workspaceDir }
}

describe.sequential('version guard', () => {
  afterEach(() => {
    process.chdir(originalCwd)
    process.argv = [...originalArgv]
    if (originalNpmPackageJson === undefined) {
      delete process.env.npm_package_json
    } else {
      process.env.npm_package_json = originalNpmPackageJson
    }
  })

  afterAll(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('accepts Workers packages on the Vitest 4.1 line', async () => {
    const fixtureDir = createPackageFixture({
      packageName: '@webpresso/example-worker',
      vitestVersion: '4.1.1',
      withWorkersPool: true,
    })

    process.chdir(fixtureDir)
    delete process.env.npm_package_json
    process.argv = ['node', 'vitest']

    const workersModule = await importFresh<{ workersConfig: object }>(workersModuleUrl)

    expect(workersModule).toHaveProperty('workersConfig.test.coverage.provider', 'istanbul')
  })

  it('does not exempt Workers packages from the Vitest 4 requirement', async () => {
    const fixtureDir = createPackageFixture({
      packageName: '@webpresso/legacy-worker',
      vitestVersion: '3.2.4',
      withWorkersPool: true,
    })

    process.chdir(fixtureDir)
    delete process.env.npm_package_json
    process.argv = ['node', 'vitest']

    const { assertNonWorkersVitest4 } = await importFresh<{
      assertNonWorkersVitest4: ({ caller }: { caller?: string }) => void
    }>(versionGuardModuleUrl)

    expect(() => assertNonWorkersVitest4({ caller: 'test' })).toThrow(/requires vitest 4\.x/i)
  })

  it('prefers npm_package_json over cwd when resolving the consumer package', async () => {
    const fixture = createWorkspaceFixture({
      packageName: '@repo/detached-consumer',
      rootVitestVersion: '4.1.5',
      packageVitestVersion: '3.2.4',
    })

    process.chdir(fixture.workspaceDir)
    process.env.npm_package_json = resolve(fixture.packageDir, 'package.json')

    const { assertNonWorkersVitest4 } = await importFresh<{
      assertNonWorkersVitest4: ({ caller }: { caller?: string }) => void
    }>(versionGuardModuleUrl)

    expect(() => assertNonWorkersVitest4({ caller: 'test' })).toThrow(
      /@repo\/detached-consumer appears to be using vitest 3\.2\.4/i,
    )
  })

  it('falls back to the explicit config path when cwd points at the workspace root', async () => {
    const fixture = createWorkspaceFixture({
      packageName: '@repo/config-path-consumer',
      rootVitestVersion: '4.1.5',
      packageVitestVersion: '3.2.4',
    })

    process.chdir(fixture.workspaceDir)
    process.argv = ['node', 'vitest', '--config', fixture.configPath]
    delete process.env.npm_package_json

    const { assertNonWorkersVitest4 } = await importFresh<{
      assertNonWorkersVitest4: ({ caller }: { caller?: string }) => void
    }>(versionGuardModuleUrl)

    expect(() => assertNonWorkersVitest4({ caller: 'test' })).toThrow(
      /@repo\/config-path-consumer appears to be using vitest 3\.2\.4/i,
    )
  })
})
