import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import path from 'node:path'

import { readConfig } from '#cli/commands/init/config'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const FORBIDDEN_DEPENDENCY_PATTERNS: readonly RegExp[] = [
  /^typescript$/u,
  /^vite$/u,
  /^vitest$/u,
  /^@stryker-mutator\//u,
  /^@playwright\/test$/u,
  /^wrangler$/u,
  /^oxlint$/u,
  /^oxfmt$/u,
  /^tsx$/u,
]

const FORBIDDEN_SCRIPT_PATTERNS: readonly RegExp[] = [
  /(^|\s)(tsc|vite|vitest|stryker|playwright|wrangler|oxlint|oxfmt|tsx)(\s|$)/u,
  /node\s+\.\/node_modules\/(typescript|vite|vitest|wrangler|oxlint|tsx)\//u,
]

const ALLOWED_SCRIPT_PREFIXES = ['wp ', 'vp run ', 'vp run -r ']

type PackageJson = {
  name?: unknown
  scripts?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
}

export function auditToolchainIsolation(root: string): RepoAuditResult {
  const packagePaths = findPackageJsonFiles(root)
  const violations: RepoAuditViolation[] = []
  // Per-repo runtime exemptions: dependency names the repo declares as
  // legitimate app-specific runtimes rather than generic toolchain.
  const allowDependencies = new Set(
    readConfig(root)?.audit?.toolchainIsolation?.allowDependencies ?? [],
  )

  for (const packagePath of packagePaths) {
    const pkg = readPackageJson(packagePath)
    if (!pkg) {
      violations.push({ file: packagePath, message: 'package.json must be valid JSON' })
      continue
    }

    if (isExemptPackage(root, packagePath, pkg)) continue

    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      for (const depName of Object.keys(pkg[field] ?? {})) {
        if (!isForbiddenDependency(depName)) continue
        if (allowDependencies.has(depName)) continue
        violations.push({
          file: packagePath,
          message: `${field}.${depName} is toolchain-owned; route it through @webpresso/agent-kit/wp instead of declaring it directly`,
        })
      }
    }

    for (const [scriptName, scriptValue] of Object.entries(pkg.scripts ?? {})) {
      if (typeof scriptValue !== 'string') continue
      if (isAllowedScript(scriptValue)) continue
      if (!FORBIDDEN_SCRIPT_PATTERNS.some((pattern) => pattern.test(scriptValue))) continue
      violations.push({
        file: packagePath,
        message: `script "${scriptName}" invokes a toolchain binary directly; use wp-managed commands instead`,
      })
    }
  }

  return {
    ok: violations.length === 0,
    title: 'Toolchain isolation',
    checked: packagePaths.length,
    violations,
  }
}

function isExemptPackage(root: string, packagePath: string, pkg: PackageJson): boolean {
  if (pkg.name === '@webpresso/agent-kit') return true

  const relativePath = path.relative(root, packagePath).split(path.sep).join('/')
  // Catalog skill templates are sample project manifests shipped by agent-kit,
  // not live consumer package manifests. They intentionally demonstrate raw
  // framework CLIs in generated starter content and should not make agent-kit's
  // own audit fail.
  const unpackedPath = relativePath.replace(/^\.webpresso-packed-surface\//u, '')
  if (unpackedPath.startsWith('catalog/') && unpackedPath.includes('/templates/')) return true

  return false
}

function findPackageJsonFiles(root: string): string[] {
  const files: string[] = []
  walk(root, files)
  return files.sort()
}

function walk(dir: string, files: string[]): void {
  for (const entry of safeReadDir(dir)) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) walk(absolute, files)
      continue
    }
    if (entry.isFile() && entry.name === 'package.json') files.push(absolute)
  }
}

function safeReadDir(dir: string): Dirent[] {
  try {
    return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []
  } catch {
    return []
  }
}

function shouldSkipDirectory(name: string): boolean {
  return [
    '.git',
    'node_modules',
    'dist',
    'build',
    '.turbo',
    '.next',
    '.wrangler',
    '.agent',
    '.agents',
    '.gemini',
    '.windsurf',
    '.omx',
    '.omc',
    '.codex',
    '_worktrees',
    // Gitignored Claude Code agent surface — agent worktree scratch under
    // .claude/worktrees/* carries vendored package manifests that are not the
    // repo's own packages; walking it produces false positives on local dev
    // machines and in consumer repos that run agent worktrees.
    '.claude',
  ].includes(name)
}

function readPackageJson(file: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

function isForbiddenDependency(depName: string): boolean {
  return FORBIDDEN_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(depName))
}

function isAllowedScript(script: string): boolean {
  const trimmed = script.trim()
  return ALLOWED_SCRIPT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}
