import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { validateLoreTrailers } from './commit-message-lore.js'

export interface RepoAuditViolation {
  file?: string
  message: string
}

export interface RepoAuditResult {
  ok: boolean
  title: string
  checked: number
  violations: RepoAuditViolation[]
}

export interface CatalogDriftOptions {
  workspaceFile?: string
}

export interface DocsFrontmatterOptions {
  docsRoot?: string
  allowedTypes?: readonly string[]
  folderTypes?: Readonly<Record<string, string>>
  fix?: boolean
  today?: string
}

export interface BlueprintLifecycleOptions {
  blueprintsRoot?: string
  statuses?: readonly string[]
  includeLegacyOmx?: boolean
}

export interface CommitMessageOptions {
  allowedTypes?: readonly string[]
  loreWarn?: boolean
  requireLore?: boolean
  subjectMaxLength?: number
}

interface PackageDependencyUse {
  packageFile: string
  dependencyName: string
  version: string
}

const DEFAULT_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const

const DEFAULT_DOC_TYPES = [
  'guide',
  'system',
  'research',
  'runbook',
  'postmortem',
  'adr',
  'migration',
  'template',
  'docs-index',
] as const

const DEFAULT_DOC_FOLDER_TYPES: Readonly<Record<string, string>> = {
  adrs: 'adr',
  decisions: 'adr',
  migrations: 'migration',
  research: 'research',
  runbooks: 'runbook',
  templates: 'template',
}

const DEFAULT_BLUEPRINT_STATUSES = [
  'draft',
  'planned',
  'in-progress',
  'parked',
  'completed',
  'archived',
] as const

export function auditCatalogDrift(
  rootDirectory: string = process.cwd(),
  options: CatalogDriftOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const workspacePath = resolve(root, options.workspaceFile ?? 'pnpm-workspace.yaml')
  const violations: RepoAuditViolation[] = []

  if (!existsSync(workspacePath)) {
    return result('Catalog drift — single package (no workspace file)', 0, [])
  }

  const workspaceYaml = readFileSync(workspacePath, 'utf8')
  const workspaceGlobs = parseWorkspacePackageGlobs(workspaceYaml)
  const catalogNames = parseCatalogDependencyNames(workspaceYaml)
  const packageFiles = discoverWorkspacePackageFiles(root, workspaceGlobs)
  const dependencyUses = new Map<string, PackageDependencyUse[]>()

  for (const packageFile of packageFiles) {
    const pkg = readJsonObject(packageFile)
    // peerDependencies are compatibility constraints, not installed package
    // versions, so ranges such as ">=19" are legitimate and should not be
    // forced through a pnpm catalog.
    const sections = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

    for (const section of sections) {
      const dependencies = readStringRecord(pkg[section])
      for (const [dependencyName, version] of Object.entries(dependencies)) {
        const uses = dependencyUses.get(dependencyName) ?? []
        uses.push({ packageFile, dependencyName, version })
        dependencyUses.set(dependencyName, uses)
      }
    }
  }

  for (const [dependencyName, uses] of [...dependencyUses.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (uses.length < 2) continue

    for (const use of uses) {
      if (isSharedDependencyReference(use.version)) continue

      const catalogHint = catalogNames.has(dependencyName)
        ? 'use catalog:'
        : 'promote it to the pnpm catalog or use workspace:'
      violations.push({
        file: relativePath(root, use.packageFile),
        message: `${dependencyName} is used in ${uses.length} workspaces but declares ${JSON.stringify(use.version)}; ${catalogHint}`,
      })
    }
  }

  return result('Catalog drift', packageFiles.length, violations)
}

export function validateCommitMessage(
  message: string,
  options: CommitMessageOptions = {},
): RepoAuditResult {
  const violations: RepoAuditViolation[] = []
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const subject = lines[0]?.trimEnd() ?? ''
  const allowedTypes = options.allowedTypes ?? DEFAULT_COMMIT_TYPES
  const subjectMaxLength = options.subjectMaxLength ?? 100

  if (subject.length === 0) {
    violations.push({ message: 'Commit subject is required' })
    return result('Commit message', 1, violations)
  }

  if (/^(Merge|Revert|fixup!|squash!)/.test(subject)) {
    return result('Commit message', 1, [])
  }

  const conventionalMatch = /^(?<type>[a-z]+)(?:\([^)]+\))?!?: .+/.exec(subject)
  if (!conventionalMatch?.groups?.type || !allowedTypes.includes(conventionalMatch.groups.type)) {
    violations.push({
      message: `Commit subject must be conventional (${allowedTypes.join('|')})(scope): summary`,
    })
  }

  if (subject.length > subjectMaxLength) {
    violations.push({
      message: `Commit subject must be ${subjectMaxLength} characters or fewer`,
    })
  }

  if (lines.length > 1 && lines[1] !== '') {
    violations.push({
      message: 'Second line must be blank when a commit body is present',
    })
  }

  const shouldEnforceLore =
    options.requireLore === true || options.loreWarn === true || subject.includes('[lore]')
  if (shouldEnforceLore) {
    const loreResult = validateLoreTrailers(message, {
      requireLore: options.requireLore === true || subject.includes('[lore]'),
      loreWarn:
        options.loreWarn === true && !(options.requireLore === true || subject.includes('[lore]')),
    })
    for (const violation of loreResult.violations) {
      violations.push({ message: violation })
    }
    for (const warning of loreResult.warnings) {
      console.warn(`[lore-warn] ${warning}`)
    }
  }

  return result('Commit message', 1, violations)
}

export function auditCommitMessageFile(
  messageFile: string,
  options: CommitMessageOptions = {},
): RepoAuditResult {
  return withFilePrefix(
    resolve(messageFile),
    validateCommitMessage(readFileSync(messageFile, 'utf8'), options),
  )
}

export function auditDocsFrontmatter(
  rootDirectory: string = process.cwd(),
  options: DocsFrontmatterOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const docsRoot = resolve(root, options.docsRoot ?? 'docs')
  const allowedTypes = new Set(options.allowedTypes ?? DEFAULT_DOC_TYPES)
  const folderTypes = options.folderTypes ?? DEFAULT_DOC_FOLDER_TYPES
  const violations: RepoAuditViolation[] = []
  const today = options.today ?? new Date().toISOString().slice(0, 10)

  if (!existsSync(docsRoot)) {
    return result('Docs frontmatter', 0, [])
  }

  const markdownFiles = walkMarkdownFiles(docsRoot)
  for (const file of markdownFiles) {
    let markdown = readFileSync(file, 'utf8')
    const folder = relativePath(docsRoot, file).split('/')[0] ?? ''
    const inferredType = folderTypes[folder] ?? 'guide'

    if (options.fix) {
      const fixed = applyDocsFrontmatterFix(markdown, {
        inferredType,
        today,
      })
      if (fixed !== markdown) {
        writeFileSync(file, fixed, 'utf8')
        markdown = fixed
      }
    }

    const frontmatter = parseFrontmatter(markdown)
    const relativeFile = relativePath(root, file)
    const type = frontmatter.type
    const lastUpdated = frontmatter.last_updated

    if (!type) {
      violations.push({
        file: relativeFile,
        message: 'Missing required frontmatter field: type',
      })
    } else if (folder !== 'templates' && !allowedTypes.has(type)) {
      violations.push({
        file: relativeFile,
        message: `Invalid type ${JSON.stringify(type)}`,
      })
    }

    if (!lastUpdated) {
      violations.push({
        file: relativeFile,
        message: 'Missing required frontmatter field: last_updated',
      })
    }

    const expectedType = folderTypes[folder]
    if (folder !== 'templates' && expectedType && type && type !== expectedType) {
      violations.push({
        file: relativeFile,
        message: `Docs in ${folder}/ must use type: ${expectedType}`,
      })
    }
  }

  return result('Docs frontmatter', markdownFiles.length, violations)
}

export function auditBlueprintLifecycle(
  rootDirectory: string = process.cwd(),
  options: BlueprintLifecycleOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const blueprintsRoot = resolve(root, options.blueprintsRoot ?? 'blueprints')
  const statuses = options.statuses ?? DEFAULT_BLUEPRINT_STATUSES
  const violations: RepoAuditViolation[] = []
  let checked = 0

  for (const status of statuses) {
    const statusRoot = join(blueprintsRoot, status)
    if (!existsSync(statusRoot)) continue

    for (const entry of readdirSync(statusRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const overviewPath = join(statusRoot, entry.name, '_overview.md')
      checked += 1

      if (!existsSync(overviewPath)) {
        violations.push({
          file: relativePath(root, overviewPath),
          message: 'Missing _overview.md',
        })
        continue
      }

      const frontmatter = parseFrontmatter(readFileSync(overviewPath, 'utf8'))
      if (frontmatter.type !== 'blueprint' && frontmatter.type !== 'parent-roadmap') {
        violations.push({
          file: relativePath(root, overviewPath),
          message: 'Blueprint overview must use type: blueprint or parent-roadmap',
        })
      }

      if (frontmatter.status !== status) {
        violations.push({
          file: relativePath(root, overviewPath),
          message: `Blueprint status must match folder (${status})`,
        })
      }
    }
  }

  if (options.includeLegacyOmx === true) {
    const legacy = auditLegacyOmxPlans(root)
    checked += legacy.checked
    violations.push(...legacy.violations)
  }

  return result('Blueprint lifecycle', checked, violations)
}

export function formatRepoAuditReport(auditResult: RepoAuditResult): string {
  const status = auditResult.ok ? 'OK' : 'FAILED'
  const lines = [`${auditResult.title}: ${status} (${auditResult.checked} checked)`]

  for (const violation of auditResult.violations) {
    const location = violation.file ? `${violation.file}: ` : ''
    lines.push(`- ${location}${violation.message}`)
  }

  return lines.join('\n')
}

function result(title: string, checked: number, violations: RepoAuditViolation[]): RepoAuditResult {
  return { ok: violations.length === 0, title, checked, violations }
}

function parseWorkspacePackageGlobs(workspaceYaml: string): string[] {
  return extractTopLevelBlock(workspaceYaml, 'packages')
    .map((line) => /^\s*-\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => stripQuotes(value.trim()))
    .filter((value) => value.length > 0 && !value.startsWith('!'))
}

function parseCatalogDependencyNames(workspaceYaml: string): Set<string> {
  const names = new Set<string>()

  for (const line of extractTopLevelBlock(workspaceYaml, 'catalog')) {
    const match = /^\s+([^:#][^:]*):\s*(.+?)\s*$/.exec(line)
    if (match?.[1] && match[2] !== '') names.add(stripQuotes(match[1].trim()))
  }

  for (const line of extractTopLevelBlock(workspaceYaml, 'catalogs')) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    const match = /^\s+([^:#][^:]*):\s*(.+?)\s*$/.exec(line)
    if (indent >= 4 && match?.[1] && match[2] !== '') names.add(stripQuotes(match[1].trim()))
  }

  return names
}

function extractTopLevelBlock(yaml: string, key: string): string[] {
  const lines: string[] = []
  let inBlock = false

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue

    const topLevelKey = /^([A-Za-z0-9_-]+):/.exec(trimmed)?.[1]
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (indent === 0 && topLevelKey) {
      inBlock = topLevelKey === key
      continue
    }

    if (inBlock) lines.push(line)
  }

  return lines
}

function discoverWorkspacePackageFiles(root: string, workspaceGlobs: readonly string[]): string[] {
  const packageFiles = new Set<string>()

  for (const workspaceGlob of workspaceGlobs) {
    const normalizedGlob = workspaceGlob.replace(/\\/g, '/')
    if (normalizedGlob.endsWith('/*')) {
      const baseDirectory = resolve(root, normalizedGlob.slice(0, -2))
      if (!existsSync(baseDirectory)) continue

      for (const entry of readdirSync(baseDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const packageFile = join(baseDirectory, entry.name, 'package.json')
        if (existsSync(packageFile)) packageFiles.add(packageFile)
      }
      continue
    }

    const packageFile = resolve(root, normalizedGlob, 'package.json')
    if (existsSync(packageFile)) packageFiles.add(packageFile)
  }

  return [...packageFiles].toSorted((left, right) => left.localeCompare(right))
}

function isSharedDependencyReference(version: string): boolean {
  return (
    version.startsWith('catalog:') ||
    version.startsWith('workspace:') ||
    version.startsWith('file:') ||
    version.startsWith('link:')
  )
}

function readJsonObject(file: string): Record<string, unknown> {
  const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function walkMarkdownFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(path))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
  }

  return files.toSorted((left, right) => left.localeCompare(right))
}

export function parseFrontmatter(markdown: string): Record<string, string> {
  if (!markdown.startsWith('---')) return {}

  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return {}

  const frontmatter = markdown.slice(3, end)
  const data: Record<string, string> = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line)
    if (!match?.[1]) continue
    data[match[1]] = stripQuotes(match[2] ?? '')
  }

  return data
}

function applyDocsFrontmatterFix(
  markdown: string,
  options: { inferredType: string; today: string },
): string {
  const frontmatter = parseFrontmatter(markdown)
  const needsType = !frontmatter.type
  const needsLastUpdated = !frontmatter.last_updated
  if (!needsType && !needsLastUpdated) return markdown

  const lines: string[] = []
  if (needsType) {
    lines.push('# TODO: classify type — auto-set by ak')
    lines.push(`type: ${options.inferredType}`)
  }
  if (needsLastUpdated) {
    lines.push(`last_updated: '${options.today}'`)
  }

  if (!markdown.startsWith('---')) {
    return `---\n${lines.join('\n')}\n---\n\n${markdown}`
  }

  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return markdown
  return `${markdown.slice(0, end)}\n${lines.join('\n')}${markdown.slice(end)}`
}

function auditLegacyOmxPlans(root: string): {
  checked: number
  violations: RepoAuditViolation[]
} {
  const plansRoot = join(root, '.omx', 'plans')
  const contractsRoot = join(root, '.omx', 'contracts')
  const lifecycleRoot = join(root, '.omx', 'state', 'lifecycle')
  const contractPath = join(contractsRoot, 'workspace-boundary-contract.md')
  const violations: RepoAuditViolation[] = []
  let checked = 0

  const prdFiles = readDirectoryEntries(plansRoot).filter((file) => /^prd-.+\.md$/.test(file))
  const testSpecFiles = readDirectoryEntries(plansRoot).filter((file) =>
    /^test-spec-.+\.md$/.test(file),
  )
  const lifecycleFiles = readDirectoryEntries(lifecycleRoot).filter((file) =>
    file.endsWith('.json'),
  )
  const hasLegacySurface =
    existsSync(contractPath) ||
    prdFiles.length > 0 ||
    testSpecFiles.length > 0 ||
    lifecycleFiles.length > 0

  if (!hasLegacySurface) return { checked, violations }

  if (!existsSync(plansRoot)) {
    violations.push({
      file: relativePath(root, plansRoot),
      message: 'Missing .omx/plans directory',
    })
  }

  if (!existsSync(contractsRoot)) {
    violations.push({
      file: relativePath(root, contractsRoot),
      message: 'Missing .omx/contracts directory',
    })
  }

  if (!existsSync(lifecycleRoot)) {
    violations.push({
      file: relativePath(root, lifecycleRoot),
      message: 'Missing .omx/state/lifecycle directory',
    })
  }

  checked += 1
  const contractContent = readTextIfExists(contractPath)
  if (!contractContent) {
    violations.push({
      file: relativePath(root, contractPath),
      message: 'Missing workspace boundary contract',
    })
  } else {
    for (const marker of ['# Workspace boundary contract', '## Workspace classifications']) {
      if (!contractContent.includes(marker)) {
        violations.push({
          file: relativePath(root, contractPath),
          message: `workspace-boundary-contract.md is missing required marker: ${marker}`,
        })
      }
    }
  }

  if (prdFiles.length === 0) {
    violations.push({
      file: relativePath(root, plansRoot),
      message: 'Missing at least one PRD artifact under .omx/plans',
    })
  }

  if (testSpecFiles.length === 0) {
    violations.push({
      file: relativePath(root, plansRoot),
      message: 'Missing at least one test spec artifact under .omx/plans',
    })
  }

  if (lifecycleFiles.length === 0) {
    violations.push({
      file: relativePath(root, lifecycleRoot),
      message: 'Missing at least one lifecycle artifact under .omx/state/lifecycle',
    })
  }

  for (const file of prdFiles) {
    checked += 1
    const content = readTextIfExists(join(plansRoot, file))
    if (!content?.includes('# PRD:')) {
      violations.push({
        file: relativePath(root, join(plansRoot, file)),
        message: `${file} is missing a PRD heading`,
      })
    }
  }

  for (const file of testSpecFiles) {
    checked += 1
    const content = readTextIfExists(join(plansRoot, file))
    if (!content?.includes('# Test Spec:')) {
      violations.push({
        file: relativePath(root, join(plansRoot, file)),
        message: `${file} is missing a test spec heading`,
      })
    }
  }

  for (const file of lifecycleFiles) {
    checked += 1
    const lifecycleContent = readTextIfExists(join(lifecycleRoot, file))
    if (!lifecycleContent) continue

    try {
      const parsed = JSON.parse(lifecycleContent) as {
        artifacts?: unknown
        slug?: unknown
        status?: unknown
      }
      if (typeof parsed.slug !== 'string' || parsed.slug.length === 0) {
        violations.push({
          file: relativePath(root, join(lifecycleRoot, file)),
          message: `Lifecycle state requires a slug (${file})`,
        })
      }
      if (typeof parsed.status !== 'string' || parsed.status.length === 0) {
        violations.push({
          file: relativePath(root, join(lifecycleRoot, file)),
          message: `Lifecycle state requires a status (${file})`,
        })
      }
      if (
        !parsed.artifacts ||
        typeof parsed.artifacts !== 'object' ||
        Array.isArray(parsed.artifacts)
      ) {
        violations.push({
          file: relativePath(root, join(lifecycleRoot, file)),
          message: `Lifecycle state requires an artifacts object (${file})`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      violations.push({
        file: relativePath(root, join(lifecycleRoot, file)),
        message: `Lifecycle state JSON is invalid in ${file}: ${message}`,
      })
    }
  }

  const files = [...prdFiles, ...testSpecFiles]
  const slugs = new Map<string, Set<string>>()
  for (const file of files) {
    const match = /^(prd|test-spec)-(.+)\.md$/.exec(file)
    if (!match?.[1] || !match[2]) continue
    const slugFiles = slugs.get(match[2]) ?? new Set<string>()
    slugFiles.add(match[1])
    slugs.set(match[2], slugFiles)
  }

  for (const [slug, slugFiles] of slugs.entries()) {
    if (!slugFiles.has('prd')) {
      violations.push({
        file: relativePath(root, join(plansRoot, `prd-${slug}.md`)),
        message: 'Missing legacy PRD plan',
      })
    }
    if (!slugFiles.has('test-spec')) {
      violations.push({
        file: relativePath(root, join(plansRoot, `test-spec-${slug}.md`)),
        message: 'Missing legacy test spec plan',
      })
    }
  }

  return { checked, violations }
}

function readDirectoryEntries(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory) : []
}

function readTextIfExists(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

export interface NoLinkProtocolOptions {
  workspaceFile?: string
  extraPackageGlobs?: readonly string[]
}

/**
 * Fail if any package.json (root, workspaces, or named extras) declares a
 * `link:<filesystem-path>` value in `dependencies`, `devDependencies`,
 * `optionalDependencies`, or `pnpm.overrides`. `link:` filesystem-couples
 * consumer clones to a maintainer's directory layout and hides version-pin
 * drift; use `catalog:` (cross-repo) or `workspace:*` (intra-repo) instead.
 */
export function auditNoLinkProtocol(
  rootDirectory: string = process.cwd(),
  options: NoLinkProtocolOptions = {},
): RepoAuditResult {
  const root = resolve(rootDirectory)
  const workspacePath = resolve(root, options.workspaceFile ?? 'pnpm-workspace.yaml')
  const violations: RepoAuditViolation[] = []

  const packageFiles = new Set<string>()
  const rootPackageFile = resolve(root, 'package.json')
  if (existsSync(rootPackageFile)) packageFiles.add(rootPackageFile)

  if (existsSync(workspacePath)) {
    const workspaceGlobs = parseWorkspacePackageGlobs(readFileSync(workspacePath, 'utf8'))
    for (const discovered of discoverWorkspacePackageFiles(root, workspaceGlobs)) {
      packageFiles.add(discovered)
    }
  }

  for (const extraGlob of options.extraPackageGlobs ?? []) {
    for (const discovered of discoverWorkspacePackageFiles(root, [extraGlob])) {
      packageFiles.add(discovered)
    }
  }

  const sortedPackageFiles = [...packageFiles].toSorted((left, right) => left.localeCompare(right))

  for (const packageFile of sortedPackageFiles) {
    const pkg = readJsonObject(packageFile)
    const file = relativePath(root, packageFile)

    const directSections = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
    for (const section of directSections) {
      for (const [name, value] of Object.entries(readStringRecord(pkg[section]))) {
        if (value.startsWith('link:')) {
          violations.push({
            file,
            message: `${section}.${name}: ${JSON.stringify(value)} — replace with "catalog:" (cross-repo) or "workspace:*" (intra-repo)`,
          })
        }
      }
    }

    const pnpm = pkg.pnpm
    if (pnpm && typeof pnpm === 'object' && !Array.isArray(pnpm)) {
      const overrides = readStringRecord((pnpm as Record<string, unknown>).overrides)
      for (const [name, value] of Object.entries(overrides)) {
        if (value.startsWith('link:')) {
          violations.push({
            file,
            message: `pnpm.overrides.${name}: ${JSON.stringify(value)} — link: in overrides filesystem-couples the consumer; remove the override or pin to a published version`,
          })
        }
      }
    }
  }

  return result('no-link-protocol', sortedPackageFiles.length, violations)
}

export interface NoRelativeParentImportsOptions {
  srcDir?: string
  extensions?: readonly string[]
  /**
   * Skip the tsconfig*.json scan entirely. Off by default — tsconfig parent
   * paths (`extends`, `paths`, `references`, `include`, `outDir`, etc.) are
   * audited alongside source imports.
   */
  skipTsconfig?: boolean
  /** Directory to start the tsconfig scan from. Defaults to the repo root. */
  tsconfigRoot?: string
}

/**
 * Fail if any source file contains relative parent imports (`../`) or if any
 * `tsconfig*.json` declares a parent-relative path. Use `#alias` package
 * imports for source code and a workspace path mapping / package alias for
 * tsconfig `extends`, `paths`, `references`, etc.
 */
export function auditNoRelativeParentImports(
  root: string,
  options: NoRelativeParentImportsOptions = {},
): RepoAuditResult {
  const srcDir = resolve(root, options.srcDir ?? 'src')
  const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx']
  const violations: RepoAuditViolation[] = []
  let checked = 0

  function walk(dir: string): void {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
        continue
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue
      if (entry.name.endsWith('.integration.test.ts')) continue

      checked++
      const content = readFileSync(full, 'utf-8')
      const rel = relativePath(root, full)
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        // Skip comment lines
        if (/^\s*(\/\/|\/\*)/.test(line)) continue
        if (/(?:from|export\s+\*\s+from)\s+['"]\.\.\//.test(line)) {
          violations.push({
            file: rel,
            message: `Line ${i + 1}: relative parent import detected — use a \`#\` alias instead: ${line.trim()}`,
          })
        }
        // Detect 3+ level fixed-depth path traversal in runtime code.
        // These break when src/ vs dist/esm/ depth differs. Use resolvePackageAsset() instead.
        const hasDeepStringTraversal = /['"`][^'"`\n]*(?:\.\.\/){3,}[^'"`\n]*['"`]/.test(line)
        const hasDeepArgTraversal = (line.match(/['"]\.\.['"]/g)?.length ?? 0) >= 3
        if (hasDeepStringTraversal || hasDeepArgTraversal) {
          violations.push({
            file: rel,
            message: `Line ${i + 1}: fixed-depth path traversal (3+ levels) — use resolvePackageAsset() to locate package assets portably: ${line.trim()}`,
          })
        }
      }
    }
  }

  walk(srcDir)

  if (options.skipTsconfig !== true) {
    const tsconfigRoot = resolve(root, options.tsconfigRoot ?? '.')
    const tsconfigChecked = walkTsconfigParentPaths(tsconfigRoot, root, violations)
    checked += tsconfigChecked
  }

  return {
    ok: violations.length === 0,
    title: 'no-relative-parent-imports',
    checked,
    violations,
  }
}

const TSCONFIG_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.cache',
  '.next',
  '.turbo',
  '.omx',
  // Mutation-testing sandbox (gitignored, generated per package).
  '.stryker-tmp',
  // Per-worktree clones (Claude Code Agent isolation) — not part of the
  // canonical source tree, audit them via their own root if needed.
  '.claude',
  // Scaffolding templates: content under `template/` becomes a downstream
  // customer's source tree, not ours. Parent paths inside template
  // tsconfigs reference the scaffolded layout, not the repo layout.
  'template',
])

/**
 * Walk the repo for `tsconfig*.json` files and flag any value that uses a
 * parent-relative path (`../`). Covers `extends`, `paths`, `references`,
 * `include`, `exclude`, `files`, `baseUrl`, `rootDir`, `outDir`, etc., by
 * scanning every string value recursively. tsconfig.json supports JSONC
 * (trailing commas + comments), but we only need to inspect string-shaped
 * values — a defensive line-level scan tolerates the comment syntax.
 */
function walkTsconfigParentPaths(
  startDir: string,
  reportRoot: string,
  violations: RepoAuditViolation[],
): number {
  if (!existsSync(startDir)) return 0
  let checked = 0

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (TSCONFIG_SKIP_DIRS.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!/^tsconfig(\.[^.]+)*\.json$/.test(entry.name)) continue

      checked += 1
      const content = readFileSync(full, 'utf-8')
      const rel = relativePath(reportRoot, full)
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        const trimmed = line.trim()
        // Skip blank lines, line comments, and block-comment-only lines.
        if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue

        // Any `"../` inside a JSON string value is a parent reference. We
        // match `"` followed by zero or more non-quote chars then `../`
        // (handles both `"../foo"` and `"./foo/../bar"`).
        if (/"[^"]*\.\.\/[^"]*"/.test(line)) {
          violations.push({
            file: rel,
            message: `Line ${i + 1}: tsconfig parent-relative path detected — use a workspace path mapping or package alias instead: ${trimmed}`,
          })
        }
      }
    }
  }

  walk(startDir)
  return checked
}

function withFilePrefix(file: string, auditResult: RepoAuditResult): RepoAuditResult {
  return {
    ...auditResult,
    violations: auditResult.violations.map((violation) => ({
      ...violation,
      file: violation.file ?? file,
    })),
  }
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function relativePath(root: string, path: string): string {
  const relativePathValue = relative(root, path)
  return relativePathValue.split(sep).join('/')
}
