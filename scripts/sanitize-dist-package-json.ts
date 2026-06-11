#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface NestedPackageJson {
  imports?: Record<string, string>
  [key: string]: unknown
}

export function sanitizeNestedPackageJson(pkg: NestedPackageJson): NestedPackageJson {
  const { imports: _imports, ...rest } = pkg
  return rest
}

function main(): void {
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const distPackageJsonPath = resolve(repoRoot, 'dist/esm/package.json')

  if (!existsSync(distPackageJsonPath)) {
    return
  }

  const pkg = JSON.parse(readFileSync(distPackageJsonPath, 'utf8')) as NestedPackageJson
  const sanitized = sanitizeNestedPackageJson(pkg)
  writeFileSync(distPackageJsonPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8')
}

if (import.meta.main) {
  main()
}
