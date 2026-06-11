#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface PackageImportsMap {
  [key: string]: string
}

interface ImportPattern {
  key: string
  target: string
  wildcard: boolean
}

const MODULE_SPECIFIER_PATTERN =
  /((?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?|import\s*\()\s*(['"])(#[^'"]+)\2/g

export function toBuiltModulePath(sourceTarget: string): string {
  const normalized = sourceTarget.startsWith('./') ? sourceTarget.slice(2) : sourceTarget

  if (!normalized.startsWith('src/')) {
    throw new Error(`Expected source target under ./src, got: ${sourceTarget}`)
  }

  const distTarget = `dist/esm/${normalized.slice('src/'.length)}`
  if (distTarget.endsWith('.ts')) {
    return `${distTarget.slice(0, -3)}.js`
  }

  return distTarget
}

function toImportPatterns(importsMap: PackageImportsMap): ImportPattern[] {
  return Object.entries(importsMap)
    .filter(
      ([key, value]) =>
        key.startsWith('#') && typeof value === 'string' && value.startsWith('./src/'),
    )
    .map(([key, target]) => ({
      key,
      target,
      wildcard: key.includes('*'),
    }))
    .sort((left, right) => {
      if (left.wildcard !== right.wildcard) return left.wildcard ? 1 : -1
      return right.key.length - left.key.length
    })
}

export function buildImportResolver(importsMap: PackageImportsMap): (specifier: string) => string {
  const patterns = toImportPatterns(importsMap)

  return (specifier: string): string => {
    for (const pattern of patterns) {
      if (!pattern.wildcard) {
        if (specifier === pattern.key) {
          return toBuiltModulePath(pattern.target)
        }

        continue
      }

      const [prefix, suffix] = pattern.key.split('*')
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix ?? '')) {
        continue
      }

      const matched = specifier.slice(prefix.length, specifier.length - (suffix?.length ?? 0))
      return toBuiltModulePath(pattern.target.replace('*', matched))
    }

    throw new Error(`No package.json#imports mapping found for built specifier: ${specifier}`)
  }
}

function toRelativeModuleSpecifier(fromFile: string, toFile: string): string {
  const fromDir = dirname(fromFile)
  const relativePath = relative(fromDir, toFile).replaceAll('\\', '/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

export function rewriteBuiltModuleSpecifiers(
  filePath: string,
  content: string,
  resolveSpecifier: (specifier: string) => string,
): string {
  return content.replace(
    MODULE_SPECIFIER_PATTERN,
    (match, prefix: string, quote: string, specifier: string) => {
      if (!specifier.startsWith('#')) {
        return match
      }

      const builtTarget = resolveSpecifier(specifier)
      const rewrittenSpecifier = toRelativeModuleSpecifier(filePath, builtTarget)
      return `${prefix}${quote}${rewrittenSpecifier}${quote}`
    },
  )
}

function visitFiles(rootDir: string, visitor: (filePath: string) => void): void {
  for (const entry of readdirSync(rootDir)) {
    const entryPath = resolve(rootDir, entry)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      visitFiles(entryPath, visitor)
      continue
    }

    if (entryPath.endsWith('.js') || entryPath.endsWith('.d.ts')) {
      visitor(entryPath)
    }
  }
}

function main(): void {
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const packageJsonPath = resolve(repoRoot, 'package.json')
  const distRoot = resolve(repoRoot, 'dist/esm')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    imports?: PackageImportsMap
  }
  const resolveSpecifier = buildImportResolver(packageJson.imports ?? {})

  if (!existsSync(distRoot)) {
    return
  }

  visitFiles(distRoot, (absolutePath) => {
    const original = readFileSync(absolutePath, 'utf8')
    const rewritten = rewriteBuiltModuleSpecifiers(
      relative(repoRoot, absolutePath).replaceAll('\\', '/'),
      original,
      resolveSpecifier,
    )

    if (rewritten !== original) {
      writeFileSync(absolutePath, rewritten, 'utf8')
    }
  })
}

if (import.meta.main) {
  main()
}
