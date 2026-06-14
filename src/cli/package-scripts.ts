import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { escapeRegExp } from '#utils/string'

export interface PackageJsonLike {
  readonly scripts?: Record<string, unknown>
  readonly dependencies?: Record<string, unknown>
  readonly devDependencies?: Record<string, unknown>
  readonly optionalDependencies?: Record<string, unknown>
}

export function readPackageJson(cwd: string): PackageJsonLike | undefined {
  const packageJsonPath = join(cwd, 'package.json')
  if (!existsSync(packageJsonPath)) return

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    return parsed as PackageJsonLike
  } catch {
    return
  }
}

export function getPackageScript(cwd: string, name: string): string | undefined {
  const parsed = readPackageJson(cwd)
  const candidate = parsed?.scripts?.[name]
  return typeof candidate === 'string' ? candidate : undefined
}

export function packageHasDependency(cwd: string, dependencyName: string): boolean {
  const parsed = readPackageJson(cwd)
  if (!parsed) return false

  return ['dependencies', 'devDependencies', 'optionalDependencies'].some((section) => {
    const dependencies = parsed[section as keyof PackageJsonLike]
    return Boolean(
      dependencies &&
      typeof dependencies === 'object' &&
      !Array.isArray(dependencies) &&
      dependencyName in dependencies,
    )
  })
}

export function packageUsesVitest(cwd: string): boolean {
  return packageHasDependency(cwd, 'vitest')
}

export function isRecursiveWpScript(script: string, verb: string): boolean {
  const normalized = stripLeadingEnvAssignments(script.trim())
  if (!normalized) return false

  const patterns = [
    new RegExp(`^(?:vp\\s+exec\\s+)?wp\\s+${escapeRegExp(verb)}(?:\\s|$)`),
    new RegExp(
      `^(?:bunx?|npx)\\s+(?:--yes\\s+)?(?:@webpresso/agent-kit\\s+)?wp\\s+${escapeRegExp(verb)}(?:\\s|$)`,
    ),
  ]

  return patterns.some((pattern) => pattern.test(normalized))
}

function stripLeadingEnvAssignments(input: string): string {
  let remaining = input.replace(/^env\s+/u, '')
  while (true) {
    const next = remaining.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)/u, '')
    if (next === remaining) return remaining.trim()
    remaining = next
  }
}
