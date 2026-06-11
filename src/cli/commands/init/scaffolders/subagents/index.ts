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

import type { MergeOptions, MergeResult } from '#cli/commands/init/merge'
import { readPackageJson } from '#cli/commands/init/detect-consumer'
import { resolveAgentKitPackageRootOrThrow } from '#cli/commands/init/package-root'

export interface ScaffoldSubagentsInput {
  repoRoot: string
  options: MergeOptions
}

type SubagentsMode =
  | { mode: 'self'; sourceRoot: string }
  | { mode: 'consumer'; sourceRoot: string }
  | { mode: 'package-fallback'; sourceRoot: string }

function detectMode(repoRoot: string): SubagentsMode {
  const pkg = readPackageJson(repoRoot).info
  if (pkg?.name === '@webpresso/agent-kit') {
    return {
      mode: 'self',
      sourceRoot: join(repoRoot, 'catalog', 'agent', 'agents'),
    }
  }

  const installedPackageJsonPath = join(
    repoRoot,
    'node_modules',
    '@webpresso',
    'agent-kit',
    'package.json',
  )
  const installedAgentsRoot = join(
    repoRoot,
    'node_modules',
    '@webpresso',
    'agent-kit',
    'catalog',
    'agent',
    'agents',
  )

  if (existsSync(installedPackageJsonPath) && existsSync(installedAgentsRoot)) {
    return {
      mode: 'consumer',
      sourceRoot: installedAgentsRoot,
    }
  }

  return {
    mode: 'package-fallback',
    sourceRoot: join(resolveCurrentPackageRoot(), 'catalog', 'agent', 'agents'),
  }
}

function resolveCurrentPackageRoot(): string {
  return resolveAgentKitPackageRootOrThrow(
    'wp init: could not locate the webpresso package root for subagents fallback.',
    { requireCatalog: true },
  )
}

export function scaffoldSubagents(input: ScaffoldSubagentsInput): MergeResult[] {
  const { repoRoot, options } = input
  const mode = detectMode(repoRoot)
  const sourceRoot = mode.sourceRoot
  const targetRoot = join(repoRoot, '.claude', 'agents')
  const results: MergeResult[] = []

  if (!existsSync(sourceRoot)) return results

  const entries = readdirSync(sourceRoot).filter((f) => f.endsWith('.md') && f !== 'README.md')
  if (entries.length === 0) return results

  if (!options.dryRun) {
    mkdirSync(targetRoot, { recursive: true })
  }
  for (const name of entries) {
    const sourcePath = join(sourceRoot, name)
    const targetPath = join(targetRoot, name)
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
        results.push({ targetPath, action: 'identical' })
      }
    } catch {
      symlinkSync(symTarget, targetPath)
      results.push({ targetPath, action: 'created' })
    }
  }

  return results
}
