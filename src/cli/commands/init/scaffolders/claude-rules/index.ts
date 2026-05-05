/**
 * Create `.claude/rules/<name>.md` symlinks pointing to `.agent/rules/<name>.md`.
 *
 * Claude Code auto-loads ALL files in `.claude/rules/` at session start. Rules
 * with a `paths:` frontmatter field are injected only when Claude reads files
 * matching those glob patterns (path-scoped). Rules without `paths:` load
 * unconditionally.
 *
 * Symlinks keep `.claude/rules/` in sync with `.agent/rules/` without
 * duplicating content — updating the catalog and re-running `ak setup` is enough.
 * Claude Code resolves symlinks natively, including circular-symlink detection.
 *
 * Idempotent:
 *   - Existing correct symlinks → 'identical' (no write)
 *   - Consumer-owned real files (not symlinks) → preserved as-is
 *   - Missing targets → created
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { MergeOptions, MergeResult } from '#cli/commands/init/merge'

export interface ScaffoldClaudeRulesInput {
  repoRoot: string
  options: MergeOptions
}

/** Relative symlink target from `.claude/rules/<name>.md` → `.agent/rules/<name>.md`. */
const SYMLINK_TARGET = (name: string) => join('..', '..', '.agent', 'rules', name)

export function scaffoldClaudeRules(input: ScaffoldClaudeRulesInput): MergeResult[] {
  const { repoRoot, options } = input
  const rulesSource = join(repoRoot, '.agent', 'rules')
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
    const targetPath = join(rulesTarget, name)
    const symTarget = SYMLINK_TARGET(name)

    if (options.dryRun) {
      results.push({ targetPath, action: 'created' })
      continue
    }

    try {
      const stat = lstatSync(targetPath)
      if (stat.isSymbolicLink()) {
        // Already a symlink — leave it (even if stale; Claude resolves/skips broken links)
        results.push({ targetPath, action: 'identical' })
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
