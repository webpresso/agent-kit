/**
 * `lore-commits` scaffolder preset.
 *
 * Writes a `.husky/commit-msg` hook that enforces Lore trailers via
 * `ak audit commit-message --require-lore`.
 *
 * Safe to compose with `base-kit`: if the hook already exists with the
 * correct content, it is a no-op.
 */
import path from 'node:path'

import { type MergeOptions, type MergeResult, writeFileMerged } from '../../merge.js'

const HOOK_CONTENT = `#!/bin/sh
ak audit commit-message --require-lore --message-file "$1"
`

export interface ScaffoldLoreCommitsInput {
  repoRoot: string
  options: MergeOptions
}

/**
 * Write the `.husky/commit-msg` hook for Lore trailer enforcement.
 *
 * Returns the merge result for the hook file.
 */
export function scaffoldLoreCommits(input: ScaffoldLoreCommitsInput): MergeResult {
  const hookPath = path.join(input.repoRoot, '.husky', 'commit-msg')
  return writeFileMerged(hookPath, HOOK_CONTENT, input.options)
}
