import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// Resolve from cwd (the consuming package) so version detection finds
// the package's own vitest, not the hoisted root version.
const require = createRequire(new URL(`file://${process.cwd()}/package.json`))

const readPackageJson = (packagePath: string): { name?: string } => {
  const fullPath = resolve(process.cwd(), packagePath)
  return require(fullPath) as { name?: string }
}

const getVitestVersion = (): string => {
  try {
    return (require('vitest/package.json') as { version: string }).version
  } catch (error) {
    const wrapped = new Error(
      `[vitest] Unable to resolve local vitest version. ` +
        `Install vitest in the package and use the correct catalog. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    )
    ;(wrapped as Error & { cause?: unknown }).cause = error
    throw wrapped
  }
}

const getVitestMajor = (): number => {
  const version = getVitestVersion()
  const major = Number.parseInt(version.split('.')[0] ?? '0', 10)
  return Number.isNaN(major) ? 0 : major
}

const hasWorkersPool = (): boolean => {
  // Check the consuming package's package.json for @cloudflare/vitest-pool-workers
  // in devDependencies. This is more reliable than require.resolve (which fails
  // due to the package's exports restrictions) or existsSync on node_modules paths
  // (which is fragile across package managers and hoisting strategies).
  try {
    const pkgPath = resolve(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }
    return (
      '@cloudflare/vitest-pool-workers' in (pkg.devDependencies ?? {}) ||
      '@cloudflare/vitest-pool-workers' in (pkg.dependencies ?? {})
    )
  } catch {
    return false
  }
}

const getPackageName = (): string => {
  try {
    return readPackageJson('package.json')?.name ?? 'this package'
  } catch {
    return 'this package'
  }
}

export const assertVitest4 = ({ caller }: { caller?: string } = {}): void => {
  const major = getVitestMajor()
  if (major >= 4) {
    return
  }

  const packageName = getPackageName()
  const catalogHint = hasWorkersPool() ? 'catalog:workers' : 'catalog:'

  throw new Error(
    `[vitest] ${caller ?? 'Vitest config'} requires vitest 4.x. ` +
      `${packageName} appears to be using vitest ${getVitestVersion()}. ` +
      `Use the Vitest 4.1 line from ${catalogHint}.`,
  )
}

export const assertNonWorkersVitest4 = ({ caller }: { caller?: string } = {}): void => {
  assertVitest4({ caller: caller ?? 'Non-workers config' })
}
