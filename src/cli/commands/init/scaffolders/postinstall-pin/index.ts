/**
 * Ensures `package.json#scripts.postinstall` includes `wp setup` so managed
 * hook files in `.claude/hooks/managed/` are regenerated on every
 * `pnpm install` after an agent-kit upgrade.
 *
 * - Already contains `wp setup` → identical (no-op)
 * - Has postinstall without `wp setup` → prepends: `wp setup && (existing)`
 * - No postinstall → sets: `wp setup`
 * - No `package.json` → identical (skip, never creates the file)
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { type MergeOptions, type MergeResult, patchJsonFile } from '#cli/commands/init/merge'

const WP_SETUP = 'wp setup'

export interface ScaffoldPostinstallPinInput {
  repoRoot: string
  options: MergeOptions
}

export function scaffoldPostinstallPin(input: ScaffoldPostinstallPinInput): MergeResult {
  const pkgPath = join(input.repoRoot, 'package.json')

  if (!existsSync(pkgPath)) {
    return { targetPath: pkgPath, action: 'identical' }
  }

  return patchJsonFile(
    pkgPath,
    (pkg) => {
      const scripts = (pkg.scripts ?? {}) as Record<string, string>
      const current = scripts.postinstall ?? ''
      if (current.includes(WP_SETUP)) return pkg
      const newPostinstall = current ? `${WP_SETUP} && (${current})` : WP_SETUP
      return { ...pkg, scripts: { ...scripts, postinstall: newPostinstall } }
    },
    input.options,
  )
}
