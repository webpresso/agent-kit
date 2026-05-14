import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const canonicalPackageJsonPath = resolve(repositoryRoot, 'package.json')

const DIRECT_TSCONFIG_EXPORTS = {
  './tsconfig/webpresso.json': './tsconfig/webpresso.json',
  './tsconfig/webpresso': './tsconfig/webpresso.json',
} as const

type PackageJson = {
  exports?: Record<string, unknown>
}

export function restoreDirectTsconfigExports(packageJson: PackageJson): PackageJson {
  return {
    ...packageJson,
    exports: {
      ...packageJson.exports,
      ...DIRECT_TSCONFIG_EXPORTS,
    },
  }
}

export function restoreCanonicalPackageJsonExports(
  packageJsonPath = canonicalPackageJsonPath,
): void {
  const original = readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(original) as PackageJson
  const restored = restoreDirectTsconfigExports(packageJson)
  const next = JSON.stringify(restored, null, 2) + '\n'

  if (next !== original) {
    writeFileSync(packageJsonPath, next, 'utf8')
  }
}

if (import.meta.main) {
  restoreCanonicalPackageJsonExports()
}
