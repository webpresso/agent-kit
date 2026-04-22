/**
 * Copy `catalog/docs/templates/` into the consumer's `docs/templates/`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { copyDirectoryMerged, type MergeOptions, type MergeResult } from './merge.js'

export interface ScaffoldDocsInput {
  catalogDir: string
  repoRoot: string
  options: MergeOptions
}

export function scaffoldDocs(input: ScaffoldDocsInput): MergeResult[] {
  const { catalogDir, repoRoot, options } = input
  const src = join(catalogDir, 'docs', 'templates')
  if (!existsSync(src)) return []
  const dst = join(repoRoot, 'docs', 'templates')
  return copyDirectoryMerged(src, dst, options)
}
