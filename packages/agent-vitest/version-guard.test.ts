import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const originalCwd = process.cwd()
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

describe.sequential('version guard', () => {
  afterEach(() => {
    process.chdir(originalCwd)
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

    const { assertNonWorkersVitest4 } = await importFresh<{
      assertNonWorkersVitest4: ({ caller }: { caller?: string }) => void
    }>(versionGuardModuleUrl)

    expect(() => assertNonWorkersVitest4({ caller: 'test' })).toThrow(
      /requires vitest 4\.x/i,
    )
  })
})
