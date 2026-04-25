import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type MergeOptions, type MergeResult, writeFileMerged } from './merge.js'

export interface ScaffoldBaseKitInput {
  catalogDir: string
  repoRoot: string
  options: MergeOptions
}

/** Template files relative to `catalog/base-kit/`, and their target paths relative to repoRoot. */
const TEMPLATE_MAP: Array<[string, string]> = [
  ['.gitignore.tmpl', '.gitignore'],
  ['.editorconfig.tmpl', '.editorconfig'],
  ['pnpm-workspace.yaml.tmpl', 'pnpm-workspace.yaml'],
  ['.secretlintrc.json.tmpl', '.secretlintrc.json'],
  ['commitlint.config.ts.tmpl', 'commitlint.config.ts'],
  ['.husky/pre-commit.tmpl', '.husky/pre-commit'],
  ['.husky/commit-msg.tmpl', '.husky/commit-msg'],
  ['.github/workflows/ci.webpresso.yml.tmpl', '.github/workflows/ci.webpresso.yml'],
]

/** Merge `engines` and `packageManager` into the consumer repo's package.json. */
function mergePackageJson(repoRoot: string, options: MergeOptions): MergeResult {
  const pkgPath = join(repoRoot, 'package.json')
  const engines = { node: '>=24' }
  const packageManager = 'pnpm@10.33.0'

  if (options.dryRun) {
    return { targetPath: pkgPath, action: 'skipped-dry' }
  }

  let pkg: Record<string, unknown> = {}
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    } catch {
      // malformed — leave untouched
      return { targetPath: pkgPath, action: 'identical' }
    }
  } else {
    pkg = { name: 'my-app', version: '0.0.0', private: true, type: 'module' }
  }

  const existing = pkg['engines'] as Record<string, string> | undefined
  const alreadyHasEngines = existing?.node === engines.node
  const alreadyHasPm = pkg['packageManager'] === packageManager

  if (alreadyHasEngines && alreadyHasPm) {
    return { targetPath: pkgPath, action: 'identical' }
  }

  pkg['engines'] = { ...(existing ?? {}), node: engines.node }
  pkg['packageManager'] = packageManager

  // Ensure husky is in devDependencies so `pnpm exec husky init` works
  const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>
  if (!devDeps['husky']) {
    devDeps['husky'] = '^9.0.0'
    pkg['devDependencies'] = devDeps
  }

  mkdirSync(dirname(pkgPath), { recursive: true })
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return { targetPath: pkgPath, action: 'overwritten' }
}

export function scaffoldBaseKit(input: ScaffoldBaseKitInput): MergeResult[] {
  const { catalogDir, repoRoot, options } = input
  const baseKitDir = join(catalogDir, 'base-kit')
  const results: MergeResult[] = []

  for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
    const tmplPath = join(baseKitDir, tmplRel)
    if (!existsSync(tmplPath)) continue
    const content = readFileSync(tmplPath, 'utf8')
    const targetPath = join(repoRoot, targetRel)
    results.push(writeFileMerged(targetPath, content, options))
  }

  // Make husky hook files executable
  if (!options.dryRun) {
    for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
      if (tmplRel.startsWith('.husky/')) {
        const targetPath = join(repoRoot, targetRel)
        if (existsSync(targetPath)) {
          try { chmodSync(targetPath, 0o755) } catch { /* non-fatal */ }
        }
      }
    }
  }

  results.push(mergePackageJson(repoRoot, options))
  return results
}
