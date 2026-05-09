/**
 * Create `.claude/rules/<name>.md` symlinks pointing to the canonical catalog
 * rules directory for the current mode.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { MergeOptions, MergeResult } from '#cli/commands/init/merge'
import { readPackageJson } from '#cli/commands/init/detect-consumer'

export interface ScaffoldClaudeRulesInput {
  repoRoot: string
  options: MergeOptions
}

type ClaudeRulesMode =
  | { mode: 'self'; sourceRoot: string }
  | { mode: 'consumer'; sourceRoot: string }
  | { mode: 'package-fallback'; sourceRoot: string }

function detectMode(repoRoot: string): ClaudeRulesMode {
  const pkg = readPackageJson(repoRoot).info
  if (pkg?.name === '@webpresso/agent-kit') {
    return {
      mode: 'self',
      sourceRoot: join(repoRoot, 'catalog', 'agent', 'rules'),
    }
  }

  const installedPackageJsonPath = join(
    repoRoot,
    'node_modules',
    '@webpresso',
    'agent-kit',
    'package.json',
  )
  const installedRulesRoot = join(
    repoRoot,
    'node_modules',
    '@webpresso',
    'agent-kit',
    'catalog',
    'agent',
    'rules',
  )

  if (existsSync(installedPackageJsonPath) && existsSync(installedRulesRoot)) {
    return {
      mode: 'consumer',
      sourceRoot: installedRulesRoot,
    }
  }

  return {
    mode: 'package-fallback',
    sourceRoot: join(resolveCurrentPackageRoot(), 'catalog', 'agent', 'rules'),
  }
}

function resolveCurrentPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'catalog'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('ak init: could not locate the agent-kit package root for claude-rules fallback.')
}

export function scaffoldClaudeRules(input: ScaffoldClaudeRulesInput): MergeResult[] {
  const { repoRoot, options } = input
  const mode = detectMode(repoRoot)
  const rulesSource = mode.sourceRoot
  const rulesTarget = join(repoRoot, '.claude', 'rules')
  const results: MergeResult[] = []

  if (!existsSync(rulesSource)) return results

  const entries = readdirSync(rulesSource).filter(
    (f) => f.endsWith('.md') && f !== 'README.md' && f !== '.markdownlint.json',
  )

  if (entries.length === 0) return results

  if (!options.dryRun) {
    mkdirSync(rulesTarget, { recursive: true })
  }
  for (const name of entries) {
    const sourcePath = join(rulesSource, name)
    const targetPath = join(rulesTarget, name)
    const symTarget = relative(dirname(targetPath), sourcePath)

    if (options.dryRun) {
      results.push({ targetPath, action: 'created' })
      continue
    }

    try {
      const stat = lstatSync(targetPath)
      if (stat.isSymbolicLink()) {
        const currentTarget = readlinkSync(targetPath)
        if (currentTarget === symTarget) {
          results.push({ targetPath, action: 'identical' })
        } else if (options.overwrite) {
          rmSync(targetPath)
          symlinkSync(symTarget, targetPath)
          results.push({ targetPath, action: 'overwritten' })
        } else {
          results.push({ targetPath, action: 'drifted' })
        }
      } else {
        // Consumer-owned real file — preserve it
        results.push({ targetPath, action: 'identical' })
      }
    } catch {
      // ENOENT — create the symlink
      symlinkSync(symTarget, targetPath)
      results.push({ targetPath, action: 'created' })
    }
  }

  return results
}
