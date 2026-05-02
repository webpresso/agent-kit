import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

export type BucketName = 'platform' | 'tenant-orchestration' | 'tenant-artifacts'

export interface BucketViolation {
  package: string
  rule: 'code-level' | 'wrangler-binding'
  description: string
  severity: 'error' | 'warning'
}

export interface BucketBoundaryOptions {
  /** Restrict to packages touched in git diff --name-only origin/main */
  changedOnly?: boolean
  /** Zero-tolerance: allowlist entries become errors too */
  strict?: boolean
  /** Monorepo root (defaults to cwd) */
  root?: string
}

interface PackageInfo {
  name: string
  dir: string
  bucket: BucketName | undefined
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  wranglerName: string | undefined
}

/**
 * Strip // line comments and trailing commas from JSONC so JSON.parse works.
 * No external dep.
 */
function parseJsonc(text: string): unknown {
  // Remove single-line comments (// ...) — but not inside strings
  // Simple two-pass approach: safe for wrangler configs (no unusual strings)
  const withoutComments = text.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g,
    (match, quoted) => (quoted !== undefined ? quoted : ''),
  )
  // Remove trailing commas before } or ]
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(withoutTrailingCommas)
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const text = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function readJsoncSafe(filePath: string): Record<string, unknown> | null {
  try {
    const text = readFileSync(filePath, 'utf8')
    const parsed = parseJsonc(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/**
 * Parse pnpm-workspace.yaml globs and discover matching package directories.
 * Minimal parser — supports `packages:` list with glob patterns.
 */
function discoverPackageDirs(root: string): string[] {
  const workspaceFile = join(root, 'pnpm-workspace.yaml')
  if (!existsSync(workspaceFile)) return []

  const text = readFileSync(workspaceFile, 'utf8')
  const lines = text.split('\n')

  // Collect patterns under "packages:" key
  let inPackages = false
  const patterns: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'packages:') {
      inPackages = true
      continue
    }
    if (inPackages) {
      if (trimmed.startsWith('- ')) {
        const pattern = trimmed.slice(2).replace(/['"]/g, '').trim()
        patterns.push(pattern)
      } else if (trimmed && !trimmed.startsWith('#')) {
        // New top-level key
        break
      }
    }
  }

  // Resolve glob patterns — support simple `dir/*` and `dir/**` forms
  const dirs: string[] = []
  for (const pattern of patterns) {
    if (pattern.endsWith('/*') || pattern.endsWith('/**')) {
      const parentGlob = pattern.replace(/\/\*\*?$/, '')
      const parentDir = join(root, parentGlob)
      if (!existsSync(parentDir)) continue
      const entries = readdirSync(parentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(join(parentDir, entry.name))
        }
      }
    } else {
      // Exact dir
      const dir = join(root, pattern)
      if (existsSync(dir)) dirs.push(dir)
    }
  }

  return dirs
}

function resolveWranglerName(dir: string): string | undefined {
  // Try wrangler.jsonc first, then wrangler.toml
  const jsoncPath = join(dir, 'wrangler.jsonc')
  if (existsSync(jsoncPath)) {
    const parsed = readJsoncSafe(jsoncPath)
    const name = parsed?.['name']
    return typeof name === 'string' ? name : undefined
  }
  const tomlPath = join(dir, 'wrangler.toml')
  if (existsSync(tomlPath)) {
    const text = readFileSync(tomlPath, 'utf8')
    const match = text.match(/^name\s*=\s*["']?([^"'\s\n]+)["']?/m)
    return match ? match[1] : undefined
  }
  return undefined
}

function collectPackages(root: string): PackageInfo[] {
  const dirs = discoverPackageDirs(root)
  const packages: PackageInfo[] = []

  for (const dir of dirs) {
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue

    const pkg = readJsonSafe(pkgPath)
    if (!pkg) continue

    const name = typeof pkg['name'] === 'string' ? pkg['name'] : undefined
    if (!name) continue

    const webpresso = pkg['webpresso']
    let bucket: BucketName | undefined
    if (webpresso && typeof webpresso === 'object' && !Array.isArray(webpresso)) {
      const bucketVal = (webpresso as Record<string, unknown>)['bucket']
      if (
        bucketVal === 'platform' ||
        bucketVal === 'tenant-orchestration' ||
        bucketVal === 'tenant-artifacts'
      ) {
        bucket = bucketVal
      }
    }

    const deps = (pkg['dependencies'] as Record<string, string> | undefined) ?? {}
    const devDeps = (pkg['devDependencies'] as Record<string, string> | undefined) ?? {}
    const wranglerName = resolveWranglerName(dir)

    packages.push({ name, dir, bucket, dependencies: deps, devDependencies: devDeps, wranglerName })
  }

  return packages
}

/**
 * Code-level rule: tenant-orchestration must not depend on platform.
 */
function checkCodeLevel(
  packages: PackageInfo[],
  bucketByName: Map<string, BucketName>,
  options: BucketBoundaryOptions,
): BucketViolation[] {
  const violations: BucketViolation[] = []

  for (const pkg of packages) {
    if (pkg.bucket !== 'tenant-orchestration') continue

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    for (const depName of Object.keys(allDeps)) {
      const depBucket = bucketByName.get(depName)
      if (depBucket === 'platform') {
        violations.push({
          package: pkg.name,
          rule: 'code-level',
          description: `"${pkg.name}" (tenant-orchestration) depends on "${depName}" (platform) — cross-bucket code dependency forbidden`,
          severity: 'error',
        })
      }
    }
  }

  return violations
}

interface WranglerServiceEntry {
  binding: string
  service: string
}

function readWranglerServices(
  dir: string,
): { services: WranglerServiceEntry[]; crossBucketAllowlist: string[] } {
  // Try wrangler.jsonc
  const jsoncPath = join(dir, 'wrangler.jsonc')
  let parsed: Record<string, unknown> | null = null
  if (existsSync(jsoncPath)) {
    parsed = readJsoncSafe(jsoncPath)
  } else {
    // wrangler.toml — minimal TOML parsing for [[services]]
    const tomlPath = join(dir, 'wrangler.toml')
    if (!existsSync(tomlPath)) return { services: [], crossBucketAllowlist: [] }
    // Skip TOML services parsing (complex) — only JSONC supported for now
    return { services: [], crossBucketAllowlist: [] }
  }

  if (!parsed) return { services: [], crossBucketAllowlist: [] }

  const rawServices = parsed['services']
  const services: WranglerServiceEntry[] = []
  if (Array.isArray(rawServices)) {
    for (const s of rawServices) {
      if (s && typeof s === 'object' && typeof s['service'] === 'string') {
        services.push({
          binding: typeof s['binding'] === 'string' ? s['binding'] : '',
          service: s['service'],
        })
      }
    }
  }

  // Read optional crossBucketBindings allowlist from webpresso config in wrangler
  const wranglerWebpresso = parsed['webpresso']
  let crossBucketAllowlist: string[] = []
  if (wranglerWebpresso && typeof wranglerWebpresso === 'object' && !Array.isArray(wranglerWebpresso)) {
    const list = (wranglerWebpresso as Record<string, unknown>)['crossBucketBindings']
    if (Array.isArray(list)) {
      crossBucketAllowlist = list.filter((x): x is string => typeof x === 'string')
    }
  }

  return { services, crossBucketAllowlist }
}

/**
 * Wrangler-level rule: a Worker in bucket X must not service-bind to a Worker
 * in a different bucket (unless in crossBucketBindings allowlist).
 */
function checkWranglerBindings(
  packages: PackageInfo[],
  bucketByWranglerName: Map<string, BucketName>,
  options: BucketBoundaryOptions,
): BucketViolation[] {
  const violations: BucketViolation[] = []

  for (const pkg of packages) {
    if (!pkg.bucket) continue
    if (!pkg.wranglerName) continue

    const { services, crossBucketAllowlist } = readWranglerServices(pkg.dir)

    for (const svc of services) {
      const targetBucket = bucketByWranglerName.get(svc.service)
      if (!targetBucket) continue // unknown service — skip
      if (targetBucket === pkg.bucket) continue // same bucket — OK

      const isAllowlisted = crossBucketAllowlist.includes(svc.service)
      const severity: 'error' | 'warning' = options.strict || !isAllowlisted ? 'error' : 'warning'

      violations.push({
        package: pkg.name,
        rule: 'wrangler-binding',
        description: `"${pkg.wranglerName}" (${pkg.bucket}) service-binds to "${svc.service}" (${targetBucket}) — cross-bucket Wrangler binding${isAllowlisted && !options.strict ? ' [allowlisted, warning only]' : ''}`,
        severity,
      })
    }
  }

  return violations
}

/**
 * Filter to packages touched by git diff when --changed-only is set.
 */
async function filterChangedPackages(
  packages: PackageInfo[],
  root: string,
): Promise<PackageInfo[]> {
  const { execSync } = await import('node:child_process')
  let changedFiles: string[]
  try {
    const output = execSync('git diff --name-only origin/main', { cwd: root, encoding: 'utf8' })
    changedFiles = output.split('\n').filter(Boolean).map((f) => resolve(root, f))
  } catch {
    return packages
  }

  return packages.filter((pkg) =>
    changedFiles.some((f) => f.startsWith(pkg.dir + '/') || f.startsWith(pkg.dir + '\\')),
  )
}

/**
 * Load violation descriptions from .webpresso/baseline/bucket-violations.md.
 * Any violation whose description appears in the baseline is treated as a warning
 * (not an error) in non-strict mode.
 */
function loadBaselineDescriptions(root: string): Set<string> {
  const baselinePath = join(root, '.webpresso/baseline/bucket-violations.md')
  if (!existsSync(baselinePath)) return new Set()
  const text = readFileSync(baselinePath, 'utf8')
  const descriptions = new Set<string>()
  for (const line of text.split('\n')) {
    // Table rows: | `pkg` | rule | description |
    const match = line.match(/^\|\s*`[^`]+`\s*\|\s*\S+\s*\|\s*(.+?)\s*\|/)
    if (match?.[1]) descriptions.add(match[1].trim())
  }
  return descriptions
}

/**
 * Main audit entry point.
 */
export async function auditBucketBoundary(
  root: string,
  options: BucketBoundaryOptions = {},
): Promise<RepoAuditResult> {
  const resolvedRoot = resolve(root)
  const baselineDescriptions = options.strict ? new Set<string>() : loadBaselineDescriptions(resolvedRoot)
  let packages = collectPackages(resolvedRoot)

  const annotatedPackages = packages.filter((p) => p.bucket !== undefined)

  if (options.changedOnly) {
    packages = await filterChangedPackages(packages, resolvedRoot)
  }

  // Build lookup maps
  const bucketByName = new Map<string, BucketName>()
  const bucketByWranglerName = new Map<string, BucketName>()
  for (const pkg of annotatedPackages) {
    if (pkg.bucket) {
      bucketByName.set(pkg.name, pkg.bucket)
      if (pkg.wranglerName) {
        bucketByWranglerName.set(pkg.wranglerName, pkg.bucket)
      }
    }
  }

  const workingSet = options.changedOnly
    ? packages.filter((p) => p.bucket !== undefined)
    : annotatedPackages

  const codeViolations = checkCodeLevel(workingSet, bucketByName, options)
  const wranglerViolations = checkWranglerBindings(workingSet, bucketByWranglerName, options)

  const allBucketViolations = [...codeViolations, ...wranglerViolations].map((v) => {
    // Downgrade baseline violations to warnings in non-strict mode
    if (v.severity === 'error' && baselineDescriptions.has(v.description)) {
      return { ...v, severity: 'warning' as const }
    }
    return v
  })

  // In non-strict mode, warning-severity violations don't fail the audit
  const hasErrors = allBucketViolations.some((v) => v.severity === 'error')

  const violations: RepoAuditViolation[] = allBucketViolations.map((v) => ({
    file: undefined,
    message: `[${v.severity}] [${v.rule}] ${v.description}`,
  }))

  const title = 'Bucket boundary audit'
  const checked = workingSet.length

  return {
    ok: !hasErrors,
    title,
    checked,
    violations,
  }
}
