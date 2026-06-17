import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { assertBuiltBlueprintMigrationSqlAssets } from './blueprint-migration-assets.js'
import { RUNTIME_TARGETS } from './runtime-targets.js'

type DependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies'

type PackageManifest = Record<string, unknown> &
  Partial<Record<DependencySection, Record<string, string>>>

type WorkspaceCatalogs = {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
}

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const satisfies readonly DependencySection[]

const NON_PUBLISHABLE_DEPENDENCY_PROTOCOLS = ['link:', 'workspace:', 'file:'] as const

const BACKUP_FILENAME = '.package.json.prepack.backup'
const DIST_BACKUP_DIRNAME = '.dist-prepack-backup'
const SOURCEMAP_COMMENT_BACKUP_DIRNAME = '.sourcemap-comments-prepack-backup'
const SOURCEMAP_COMMENT_PATTERN = /^\s*\/\/# sourceMappingURL=.*(?:\r?\n|$)/gmu

function asStringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return Object.fromEntries(entries)
}

function normalizePackedBinPath(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value
}

function normalizePackedBinField(value: unknown): unknown {
  if (typeof value === 'string') {
    return normalizePackedBinPath(value)
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, path]) => [
      name,
      typeof path === 'string' ? normalizePackedBinPath(path) : path,
    ]),
  )
}

export function readWorkspaceCatalogs(workspacePath: string): WorkspaceCatalogs {
  const parsed = parseYaml(readFileSync(workspacePath, 'utf8')) as {
    catalog?: unknown
    catalogs?: unknown
  }

  const catalogs = asStringMap(parsed.catalog)
  const namedCatalogs =
    parsed.catalogs && typeof parsed.catalogs === 'object' && !Array.isArray(parsed.catalogs)
      ? Object.fromEntries(
          Object.entries(parsed.catalogs)
            .map(([name, value]) => [name, asStringMap(value)])
            .filter((entry): entry is [string, Record<string, string>] => entry[1] !== undefined),
        )
      : undefined

  return {
    catalog: catalogs,
    catalogs: namedCatalogs,
  }
}

export function resolveCatalogSpecifier(
  dependencyName: string,
  version: string,
  workspaceCatalogs: WorkspaceCatalogs,
): string {
  if (!version.startsWith('catalog:')) return version

  const catalogName = version.slice('catalog:'.length)
  if (catalogName.length === 0) {
    const resolved = workspaceCatalogs.catalog?.[dependencyName]
    if (!resolved) {
      throw new Error(`Missing pnpm catalog entry for ${dependencyName}`)
    }
    return resolved
  }

  const resolved = workspaceCatalogs.catalogs?.[catalogName]?.[dependencyName]
  if (!resolved) {
    throw new Error(`Missing pnpm named catalog "${catalogName}" entry for ${dependencyName}`)
  }
  return resolved
}

function assertPublishableDependencySpecifier(
  section: DependencySection,
  dependencyName: string,
  version: string,
) {
  const blockedProtocol = NON_PUBLISHABLE_DEPENDENCY_PROTOCOLS.find((protocol) =>
    version.startsWith(protocol),
  )
  if (!blockedProtocol) return

  throw new Error(
    `Cannot pack ${section}.${dependencyName} with non-publishable ${blockedProtocol} specifier ${JSON.stringify(version)}`,
  )
}

export function createPackedManifest(
  manifest: PackageManifest,
  workspaceCatalogs: WorkspaceCatalogs,
): PackageManifest {
  const packedManifest: PackageManifest = { ...manifest }

  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = manifest[section]
    if (!dependencies) continue
    packedManifest[section] = Object.fromEntries(
      Object.entries(dependencies).map(([dependencyName, version]) => {
        const resolvedVersion = resolveCatalogSpecifier(dependencyName, version, workspaceCatalogs)
        // devDependencies are stripped from the consumer install and never published
        // as a runtime dependency — workspace: specifiers in devDeps are safe to skip.
        if (section !== 'devDependencies') {
          assertPublishableDependencySpecifier(section, dependencyName, resolvedVersion)
        }
        return [dependencyName, resolvedVersion]
      }),
    )
  }

  if ('bin' in packedManifest) {
    packedManifest.bin = normalizePackedBinField(packedManifest.bin)
  }

  if (typeof manifest.version === 'string') {
    packedManifest.optionalDependencies = {
      ...packedManifest.optionalDependencies,
      ...Object.fromEntries(
        RUNTIME_TARGETS.map((target) => [target.packageName, manifest.version as string]),
      ),
    }
  }

  return packedManifest
}

function writeJson(filePath: string, value: unknown) {
  const next = `${JSON.stringify(value, null, 2)}\n`
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, next, 'utf8')
  renameSync(tmp, filePath)
}

function writeText(filePath: string, value: string) {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, value, 'utf8')
  renameSync(tmp, filePath)
}

function pruneOrphanedDistSubtrees(rootDir: string) {
  const distRoot = join(rootDir, 'dist', 'esm')
  const srcRoot = join(rootDir, 'src')
  if (!existsSync(distRoot) || !existsSync(srcRoot)) return

  const backupRoot = join(rootDir, DIST_BACKUP_DIRNAME)
  let pruned = false

  for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const distDir = join(distRoot, entry.name)
    const srcDir = join(srcRoot, entry.name)
    if (existsSync(srcDir)) continue

    if (!existsSync(backupRoot)) mkdirSync(backupRoot, { recursive: true })
    pruned = true
    const backupTarget = join(backupRoot, entry.name)
    renameSync(distDir, backupTarget)
  }

  if (!pruned && existsSync(backupRoot)) {
    rmSync(backupRoot, { force: true, recursive: true })
  }
}

function restorePrunedDistSubtrees(rootDir: string) {
  const backupRoot = join(rootDir, DIST_BACKUP_DIRNAME)
  const distRoot = join(rootDir, 'dist', 'esm')
  if (!existsSync(backupRoot)) return

  for (const entry of readdirSync(backupRoot, { withFileTypes: true })) {
    const backupPath = join(backupRoot, entry.name)
    const restorePath = join(distRoot, entry.name)
    if (existsSync(restorePath)) {
      rmSync(restorePath, { force: true, recursive: true })
    }
    renameSync(backupPath, restorePath)
  }

  rmSync(backupRoot, { force: true, recursive: true })
}

function listBuiltTextFiles(rootDir: string): string[] {
  const distRoot = join(rootDir, 'dist', 'esm')
  if (!existsSync(distRoot)) return []

  const files: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
        files.push(entryPath)
      }
    }
  }
  visit(distRoot)
  return files.sort()
}

function relativeDistPath(rootDir: string, filePath: string): string {
  const distRoot = join(rootDir, 'dist', 'esm')
  return filePath.slice(distRoot.length + 1)
}

function stripPackedSourcemapComments(rootDir: string) {
  const backupDir = join(rootDir, SOURCEMAP_COMMENT_BACKUP_DIRNAME)
  if (existsSync(backupDir)) {
    throw new Error(`Source map comment prepack backup already exists at ${backupDir}`)
  }

  let stripped = false
  for (const filePath of listBuiltTextFiles(rootDir)) {
    const existing = readFileSync(filePath, 'utf8')
    const next = existing.replace(SOURCEMAP_COMMENT_PATTERN, '')
    if (next === existing) continue

    const backupPath = join(backupDir, relativeDistPath(rootDir, filePath))
    mkdirSync(dirname(backupPath), { recursive: true })
    writeText(backupPath, existing)
    writeText(filePath, next)
    stripped = true
  }

  if (!stripped && existsSync(backupDir)) {
    rmSync(backupDir, { force: true, recursive: true })
  }
}

function restorePackedSourcemapComments(rootDir: string) {
  const backupDir = join(rootDir, SOURCEMAP_COMMENT_BACKUP_DIRNAME)
  if (!existsSync(backupDir)) return

  const restore = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        restore(entryPath)
        continue
      }

      const targetPath = join(rootDir, 'dist', 'esm', entryPath.slice(backupDir.length + 1))
      mkdirSync(dirname(targetPath), { recursive: true })
      writeText(targetPath, readFileSync(entryPath, 'utf8'))
    }
  }

  restore(backupDir)
  rmSync(backupDir, { force: true, recursive: true })
}

export function preparePackedManifest(rootDir: string) {
  const packageJsonPath = join(rootDir, 'package.json')
  const workspacePath = join(rootDir, 'pnpm-workspace.yaml')
  const backupPath = join(rootDir, BACKUP_FILENAME)
  if (existsSync(backupPath)) {
    throw new Error(`Packed-manifest backup already exists at ${backupPath}`)
  }

  const originalManifestText = readFileSync(packageJsonPath, 'utf8')
  const manifest = JSON.parse(originalManifestText) as PackageManifest
  const packedManifest = createPackedManifest(manifest, readWorkspaceCatalogs(workspacePath))

  assertBuiltBlueprintMigrationSqlAssets(rootDir)
  writeText(backupPath, originalManifestText)
  pruneOrphanedDistSubtrees(rootDir)
  stripPackedSourcemapComments(rootDir)
  writeJson(packageJsonPath, packedManifest)
}

export function restorePackedManifest(rootDir: string) {
  const packageJsonPath = join(rootDir, 'package.json')
  const backupPath = join(rootDir, BACKUP_FILENAME)
  if (!existsSync(backupPath)) return
  writeText(packageJsonPath, readFileSync(backupPath, 'utf8'))
  rmSync(backupPath, { force: true })
  restorePackedSourcemapComments(rootDir)
  restorePrunedDistSubtrees(rootDir)
}

if (import.meta.main) {
  const command = process.argv[2]
  const rootDir = process.cwd()

  if (command === 'prepare') {
    preparePackedManifest(rootDir)
  } else if (command === 'restore') {
    restorePackedManifest(rootDir)
  } else {
    throw new Error('Usage: bun src/build/package-manifest.ts <prepare|restore>')
  }
}
