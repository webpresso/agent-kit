import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import path from 'node:path'

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

  for (const packagePath of packagePaths) {
    const pkg = readPackageJson(packagePath)
    if (!pkg) {
      violations.push({ file: packagePath, message: 'package.json must be valid JSON' })
      continue
    }

    if (pkg.name === '@webpresso/agent-kit') continue

    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      for (const depName of Object.keys(pkg[field] ?? {})) {
        if (!isForbiddenDependency(depName)) continue
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
    '.omx',
    '.omc',
    '.codex',
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
