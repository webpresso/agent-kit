import { existsSync, rmSync } from 'node:fs'
import { isAbsolute, normalize, relative, resolve } from 'node:path'

import type { AgentkitConfig } from './config.js'

export function removeConfiguredGeneratedPaths(repoRoot: string, config: AgentkitConfig): string[] {
  const removePaths = config.generatedCleanup?.removePaths ?? []
  const removed: string[] = []

  for (const relativePath of removePaths) {
    if (isAbsolute(relativePath)) continue
    const normalized = normalize(relativePath)
    const absolutePath = resolve(repoRoot, normalized)
    const repoRelative = relative(repoRoot, absolutePath)
    if (
      repoRelative === '..' ||
      repoRelative.startsWith('../') ||
      repoRelative.startsWith('..\\')
    ) {
      continue
    }
    if (!existsSync(absolutePath)) continue
    rmSync(absolutePath, { recursive: true, force: true })
    removed.push(normalized)
  }

  return removed
}
