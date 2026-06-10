import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageImports = Record<string, string>

type PackageManifest = {
  imports?: PackageImports
}

export type VitestAliasEntry = {
  find: RegExp
  replacement: string
}

const moduleDir = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(moduleDir, '../..')
const ROOT_PACKAGE_JSON = resolve(REPO_ROOT, 'package.json')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function replaceWildcards(value: string): string {
  let captureIndex = 0
  return value.replaceAll('*', () => `$${++captureIndex}`)
}

function buildFindPattern(specifier: string): RegExp {
  return new RegExp(`^${escapeRegExp(specifier).replaceAll('\\*', '(.*)')}$`, 'u')
}

function compareImportSpecificity(
  [leftKey]: readonly [string, string],
  [rightKey]: readonly [string, string],
): number {
  const leftStars = leftKey.split('*').length - 1
  const rightStars = rightKey.split('*').length - 1

  if (leftStars !== rightStars) return leftStars - rightStars
  return rightKey.length - leftKey.length
}

export function readCanonicalPackageImports(
  packageJsonPath: string = ROOT_PACKAGE_JSON,
): PackageImports {
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageManifest
  return manifest.imports ?? {}
}

export function getSourcePackageImports(imports: PackageImports): PackageImports {
  return Object.fromEntries(
    Object.entries(imports).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith('#') && entry[1].startsWith('./src/'),
    ),
  )
}

export function createVitestAliasEntriesFromPackageImports(
  imports: PackageImports = readCanonicalPackageImports(),
  repoRoot: string = REPO_ROOT,
): VitestAliasEntry[] {
  return Object.entries(getSourcePackageImports(imports))
    .sort(compareImportSpecificity)
    .map(([specifier, target]) => ({
      find: buildFindPattern(specifier),
      // Strip .ts so Vite's resolver handles both foo.ts and foo/index.ts.
      replacement: resolve(repoRoot, replaceWildcards(target.slice(2).replace(/\.ts$/, ''))),
    }))
}

export function resolveVitestAliasSpecifier(
  specifier: string,
  aliases: readonly VitestAliasEntry[],
): string | null {
  for (const alias of aliases) {
    const match = specifier.match(alias.find)
    if (!match) continue

    return alias.replacement.replace(/\$(\d+)/gu, (_, index: string) => {
      const capture = match[Number(index)]
      return capture ?? ''
    })
  }

  return null
}
