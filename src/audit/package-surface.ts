import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

interface PackageSurfaceContract {
  allowedPublicPackages?: readonly string[]
  compatibilityPublicPackages?: readonly string[]
  forbiddenPublicNamePatterns?: readonly string[]
  staleLinks?: readonly string[]
  referenceConsumerBaselines?: Readonly<Record<string, string>>
}

interface PackageRecord {
  name: string
  version?: string
  private?: boolean
}

const DEFAULT_ALLOWED_PUBLIC_PACKAGES = ['@webpresso/webpresso', '@webpresso/agent-kit', 'webpresso']

// Compatibility packages that are still publishable while the facade/hardcut
// plans complete. They are intentionally accepted by the audit, but repos can
// tighten this list by adding a package-surface contract.
const DEFAULT_COMPATIBILITY_PUBLIC_PACKAGES = [
  '@webpresso/codegen-core',
  '@webpresso/codegen-generator',
  '@webpresso/codegen-plugins-saas',
  '@webpresso/db-branching',
  '@webpresso/db-branching-neon',
  '@webpresso/layout-compiler',
  '@webpresso/layout-schema',
  '@webpresso/runtime',
  '@webpresso/runtime-decision',
  '@webpresso/runtime-format',
  '@webpresso/runtime-http',
  '@webpresso/runtime-storage',
  '@webpresso/runtime-validation',
  '@webpresso/schema-engine',
  '@webpresso/schema-frontend',
  '@webpresso/schema-loaders',
  '@webpresso/schema-spec',
  '@webpresso/ui',
  '@webpresso/ui-react',
  '@webpresso/ui-theme',
  '@webpresso/ui-i18n',
  '@webpresso/agent-docs-lint',
  '@webpresso/agent-e2e-preset',
  '@webpresso/agent-launch',
  '@webpresso/agent-oxlint',
  '@webpresso/agent-stryker',
  '@webpresso/agent-test-preset',
  '@webpresso/agent-tsconfig',
  '@webpresso/agent-vitest',
  '@webpresso/agent-workers-test',
]

const DEFAULT_FORBIDDEN_PUBLIC_NAME_PATTERNS = [
  '@webpresso/neon',
  '@webpresso/neon-core',
  '@webpresso/neon-branching',
  '@webpresso/cloudflare-pulumi',
  '@webpresso/doppler-pulumi',
]

const DEFAULT_STALE_LINKS = [
  'webpresso/monorepo/webpresso/blueprints/draft/webpresso-public-extraction-roadmap',
]

const DEFAULT_REFERENCE_BASELINES: Readonly<Record<string, string>> = {
  '@webpresso/webpresso': '0.3.6',
  '@webpresso/agent-kit': '0.18.18',
  '@webpresso/runtime': '0.5.5',
  '@webpresso/agent-stryker': '0.2.3',
  '@webpresso/agent-tsconfig': '0.2.3',
  '@webpresso/agent-vitest': '0.3.5',
  '@webpresso/agent-workers-test': '0.2.1',
  '@webpresso/db-branching': '0.2.4',
  '@webpresso/db-branching-neon': '0.2.4',
}

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.agent',
  '.agents',
  '.claude',
  '.codex',
  '.omx',
  '.omc',
  '.stryker-tmp',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.wrangler',
])

const PUBLIC_DOC_FILENAMES = new Set(['README.md', 'AGENTS.md', 'CLAUDE.md', 'VISION.md'])
const SCANNED_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js'])
const IGNORED_SCAN_BASENAMES = new Set(['CHANGELOG.md', 'pnpm-lock.yaml', 'package-lock.json'])

export function auditPackageSurface(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory)
  const loadedContract = loadPackageSurfaceContract(root)
  const contract = loadedContract.contract
  const violations: RepoAuditViolation[] = []
  let checked = 0

  const allowedPackages = new Set([
    ...DEFAULT_ALLOWED_PUBLIC_PACKAGES,
    ...(contract.allowedPublicPackages ?? []),
  ])
  const compatibilityPackages = new Set([
    ...DEFAULT_COMPATIBILITY_PUBLIC_PACKAGES,
    ...(contract.compatibilityPublicPackages ?? []),
  ])
  const forbiddenPatterns = contract.forbiddenPublicNamePatterns ?? DEFAULT_FORBIDDEN_PUBLIC_NAME_PATTERNS
  const staleLinks = contract.staleLinks ?? DEFAULT_STALE_LINKS
  const baselines = contract.referenceConsumerBaselines ?? undefined

  for (const packageFile of walkFiles(root, (file) => basename(file) === 'package.json')) {
    const pkg = readJsonObject<PackageRecord>(packageFile)
    if (!pkg.name?.startsWith('@webpresso/') && pkg.name !== 'webpresso') continue
    checked += 1
    if (pkg.private === true) continue
    if (allowedPackages.has(pkg.name) || compatibilityPackages.has(pkg.name)) continue
    violations.push({
      file: relativePath(root, packageFile),
      message: `${pkg.name} is publishable but is not in the package-surface contract`,
    })
  }

  if (loadedContract.exists) {
    for (const file of discoverPublicSurfaceFiles(root)) {
      checked += 1
      const text = readText(file)
      if (!text) continue
      for (const pattern of forbiddenPatterns) {
        if (!hasActionableForbiddenMention(text, pattern)) continue
        violations.push({
          file: relativePath(root, file),
          message: `Public surface mentions forbidden vendor-branded package ${pattern}`,
        })
      }
      for (const staleLink of staleLinks) {
        if (!text.includes(staleLink)) continue
        violations.push({
          file: relativePath(root, file),
          message: `Public surface links to stale package-surface path ${staleLink}`,
        })
      }
    }
  }

  if (baselines) {
    checked += auditReferenceConsumerFreshness(root, baselines, violations)
  }

  return {
    ok: violations.length === 0,
    title: 'Package surface',
    checked,
    violations,
  }
}

function loadPackageSurfaceContract(root: string): { contract: PackageSurfaceContract; exists: boolean } {
  const candidates = [
    join(root, 'package-surface.json'),
    join(root, '.webpresso', 'package-surface.json'),
    join(root, 'webpresso', 'package-surface.json'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    return { contract: readJsonObject<PackageSurfaceContract>(candidate), exists: true }
  }
  return { contract: {}, exists: false }
}

function discoverPublicSurfaceFiles(root: string): string[] {
  const files = new Set<string>()
  for (const name of PUBLIC_DOC_FILENAMES) {
    const file = join(root, name)
    if (existsSync(file)) files.add(file)
  }

  for (const packageFile of walkFiles(root, (file) => basename(file) === 'package.json')) {
    const packageRoot = dirname(packageFile)
    for (const name of PUBLIC_DOC_FILENAMES) {
      const file = join(packageRoot, name)
      if (existsSync(file)) files.add(file)
    }
  }

  // Root docs are public documentation; recursively scan them, but avoid heavy
  // generated/runtime directories elsewhere.
  const docsRoot = join(root, 'docs')
  if (existsSync(docsRoot)) {
    for (const file of walkFiles(docsRoot, isScannablePublicFile)) files.add(file)
  }

  return [...files].toSorted((left, right) => left.localeCompare(right))
}

function auditReferenceConsumerFreshness(
  root: string,
  baselines: Readonly<Record<string, string>>,
  violations: RepoAuditViolation[],
): number {
  const workspaceFile = join(root, 'pnpm-workspace.yaml')
  const lockfile = join(root, 'pnpm-lock.yaml')
  if (!existsSync(workspaceFile) && !existsSync(lockfile)) return 0

  const workspaceText = readText(workspaceFile) ?? ''
  const lockText = readText(lockfile) ?? ''
  let checked = 0
  for (const [packageName, minimumVersion] of Object.entries(baselines)) {
    const declaredRange = findCatalogRange(workspaceText, packageName)
    const resolvedVersion = findLockVersion(lockText, packageName)
    if (!declaredRange && !resolvedVersion) continue
    checked += 1

    if (resolvedVersion && compareVersions(resolvedVersion, minimumVersion) < 0) {
      violations.push({
        file: 'pnpm-lock.yaml',
        message: `${packageName} resolves to ${resolvedVersion}; expected at least ${minimumVersion}`,
      })
      continue
    }

    if (!resolvedVersion && declaredRange && declaredRange !== 'catalog:') {
      const declaredVersion = declaredRange.replace(/^[~^]/, '')
      if (compareVersions(declaredVersion, minimumVersion) < 0) {
        violations.push({
          file: 'pnpm-workspace.yaml',
          message: `${packageName} catalog range ${declaredRange} is older than baseline ${minimumVersion}`,
        })
      }
    }
  }
  return checked
}

function findCatalogRange(workspaceText: string, packageName: string): string | undefined {
  const escapedName = escapeRegExp(packageName)
  const match = new RegExp(`["']?${escapedName}["']?\\s*:\\s*([^\\s#]+)`).exec(workspaceText)
  return match?.[1]?.replace(/^['"]|['"]$/g, '')
}

function findLockVersion(lockText: string, packageName: string): string | undefined {
  const escapedName = escapeRegExp(packageName)
  const match = new RegExp(`${escapedName}@(\\d+\\.\\d+\\.\\d+(?:[-+][^'":\\s]+)?)`).exec(lockText)
  return match?.[1]
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)]
}

function walkFiles(root: string, predicate: (file: string) => boolean, baseRoot: string = root): string[] {
  if (root !== baseRoot && existsSync(join(root, '.git'))) return []

  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    const file = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(file, predicate, baseRoot))
      continue
    }
    if (entry.isFile() && predicate(file)) files.push(file)
  }
  return files.toSorted((left, right) => left.localeCompare(right))
}

function isScannablePublicFile(file: string): boolean {
  if (IGNORED_SCAN_BASENAMES.has(basename(file))) return false
  return SCANNED_EXTENSIONS.has(fileExtension(file))
}

function fileExtension(file: string): string {
  const name = basename(file)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot)
}

function hasActionableForbiddenMention(text: string, pattern: string): boolean {
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(pattern)) continue
    const lower = line.toLowerCase()
    if (lower.includes(`no ${pattern.toLowerCase()}`)) continue
    if (lower.includes('must not') || lower.includes('never appears') || lower.includes('forbidden')) continue
    return true
  }
  return false
}

function readJsonObject<T extends object>(file: string): T {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as T
    return value as T
  } catch {
    return {} as T
  }
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function relativePath(root: string, file: string): string {
  return relative(root, file).split('\\').join('/')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
