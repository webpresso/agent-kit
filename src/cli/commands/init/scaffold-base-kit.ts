import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type MergeOptions, type MergeResult, writeFileMerged } from './merge.js'

export interface ScaffoldBaseKitInput {
  catalogDir: string
  repoRoot: string
  options: MergeOptions
  globalInstall?: boolean
}

/** Template files relative to `catalog/base-kit/`, and their target paths relative to repoRoot. */
const TEMPLATE_MAP: Array<[string, string]> = [
  ['.editorconfig.tmpl', '.editorconfig'],
  ['.secretlintrc.json.tmpl', '.secretlintrc.json'],
  ['commitlint.config.ts.tmpl', 'commitlint.config.ts'],
  ['.husky/pre-commit.tmpl', '.husky/pre-commit'],
  ['.husky/commit-msg.tmpl', '.husky/commit-msg'],
  ['.github/workflows/ci.webpresso.yml.tmpl', '.github/workflows/ci.webpresso.yml'],
]

/**
 * Bootstrap-only templates: the scaffolder writes them when absent (so a
 * fresh repo gets sane defaults) but NEVER overwrites them once they exist
 * — even under `--overwrite`. These files are consumer-owned and grow with
 * project-specific content (catalog entries, ignore patterns) that the
 * generic template can't reproduce. Clobbering them on every `wp setup`
 * deletes that content silently, breaks `vp install`, and pollutes git
 * status with thousands of newly-tracked artifacts.
 *
 * Verified failure mode (webpresso/monorepo, 2026-05-07): the postinstall
 * `wp setup --overwrite` reduced pnpm-workspace.yaml from 221 lines (full
 * catalog) to 34 lines (generic template), removing every catalog entry
 * referenced by `pnpm.overrides` (`@neondatabase/serverless` etc.) and
 * making subsequent `vp install` fail with ERR_PNPM_CATALOG_IN_OVERRIDES.
 * The same overwrite stripped monorepo-specific .gitignore rules
 * (.test-reports/, .webpresso/generated/, all-paths/.wrangler/, etc.),
 * unmasking 23k+ generated artifacts to git status.
 */
const BOOTSTRAP_ONLY_MAP: Array<[string, string]> = [
  ['.gitignore.tmpl', '.gitignore'],
  ['pnpm-workspace.yaml.tmpl', 'pnpm-workspace.yaml'],
]

/** Merge `engines` and `packageManager` into the consumer repo's package.json. */
function mergePackageJson(
  repoRoot: string,
  options: MergeOptions,
  globalInstall = false,
): MergeResult {
  const pkgPath = join(repoRoot, 'package.json')
  const engines = { node: '>=24' }
  const packageManager = 'pnpm@11.1.1'

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
  // Don't downgrade: treat any pnpm@11+ as already-satisfied so wp setup
  // does not regress repos that have already been migrated to v11.
  const existingPm = pkg['packageManager']
  const alreadyHasPm =
    existingPm === packageManager ||
    (typeof existingPm === 'string' && /^pnpm@1[1-9]\./.test(existingPm))
  const packageName = typeof pkg['name'] === 'string' ? pkg['name'] : undefined

  const scripts = (pkg['scripts'] ?? {}) as Record<string, string>
  const hasSetupAgent = typeof scripts['setup:agent'] === 'string'

  const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>
  const hasAgentKitDevDep = typeof devDeps['@webpresso/agent-kit'] === 'string'
  const shouldSkipSelfInstall = packageName === '@webpresso/agent-kit'
  const shouldManageAgentKitAsGlobal = globalInstall && !shouldSkipSelfInstall

  if (
    alreadyHasEngines &&
    alreadyHasPm &&
    (shouldSkipSelfInstall || shouldManageAgentKitAsGlobal || hasAgentKitDevDep) &&
    (shouldSkipSelfInstall || hasSetupAgent)
  ) {
    return { targetPath: pkgPath, action: 'identical' }
  }

  pkg['engines'] = { ...existing, node: engines.node }
  if (!alreadyHasPm) pkg['packageManager'] = packageManager

  // Ensure husky is in devDependencies so `vp exec husky init` works
  if (!devDeps['husky']) {
    devDeps['husky'] = '^9.0.0'
  }
  if (!shouldSkipSelfInstall && !shouldManageAgentKitAsGlobal && !hasAgentKitDevDep) {
    // Keep consumers on the currently published dist-tag rather than a
    // repo-internal path. Do not wire this through `prepare`: `wp` is not
    // reliably on PATH during `vp install`, so `setup:agent` stays opt-in.
    devDeps['@webpresso/agent-kit'] = 'latest'
  }
  pkg['devDependencies'] = devDeps

  if (!shouldSkipSelfInstall && !hasSetupAgent) {
    scripts['setup:agent'] = 'wp setup'
  }
  if (Object.keys(scripts).length > 0) {
    pkg['scripts'] = scripts
  }

  mkdirSync(dirname(pkgPath), { recursive: true })
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return { targetPath: pkgPath, action: 'overwritten' }
}

export function scaffoldBaseKit(input: ScaffoldBaseKitInput): MergeResult[] {
  const { catalogDir, repoRoot, options, globalInstall = false } = input
  const baseKitDir = join(catalogDir, 'base-kit')
  const results: MergeResult[] = []

  for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
    const tmplPath = join(baseKitDir, tmplRel)
    if (!existsSync(tmplPath)) continue
    const content = readFileSync(tmplPath, 'utf8')
    const targetPath = join(repoRoot, targetRel)
    results.push(writeFileMerged(targetPath, content, options))
  }

  // Bootstrap-only: write template only when target is absent. Never
  // overwrite (even under --overwrite): the consumer's existing file is the
  // source of truth once it exists.
  for (const [tmplRel, targetRel] of BOOTSTRAP_ONLY_MAP) {
    const tmplPath = join(baseKitDir, tmplRel)
    if (!existsSync(tmplPath)) continue
    const targetPath = join(repoRoot, targetRel)
    if (existsSync(targetPath)) {
      results.push({ targetPath, action: 'identical' })
      continue
    }
    const content = readFileSync(tmplPath, 'utf8')
    if (options.dryRun) {
      results.push({ targetPath, action: 'skipped-dry' })
      continue
    }
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, content)
    results.push({ targetPath, action: 'created' })
  }

  // Make husky hook files executable
  if (!options.dryRun) {
    for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
      if (tmplRel.startsWith('.husky/')) {
        const targetPath = join(repoRoot, targetRel)
        if (existsSync(targetPath)) {
          try {
            chmodSync(targetPath, 0o755)
          } catch {
            /* non-fatal */
          }
        }
      }
    }
  }

  results.push(mergePackageJson(repoRoot, options, globalInstall))
  return results
}
