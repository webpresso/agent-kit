/**
 * `ak symlink sync|check` — re-sync .agents/skills/ and .gemini/commands/
 * from the canonical .agent/ tree (Codex, Amp, and Gemini CLI only).
 *
 * Primary IDEs (Claude Code, Cursor, Windsurf, OpenCode) distribute skills
 * via native channels and are no longer managed by the symlinker.
 *
 * Thin wrapper around `syncAll` from the symlinker module. `check` runs the
 * same logic as `sync` and exits non-zero if any drift was repaired —
 * suitable as a CI gate that reports "commit these changes".
 */

import type { CAC } from 'cac'

import { syncAll } from '#symlinker'
import { findRepoRoot } from '#utils/repo-root'

function commandError(message: string, exitCode = 1): Error & { exitCode: number } {
  const error = new Error(message) as Error & { exitCode: number }
  error.exitCode = exitCode
  return error
}

interface SymlinkOptions {
  dryRun?: boolean
}

export function registerSymlinkCommand(cli: CAC): void {
  cli
    .command('symlink <action>', 'Sync agent-surface files across IDE consumers')
    .action(async (action: string, options: SymlinkOptions = {}) => {
      if (options.dryRun) {
        throw commandError(
          'Unknown option: --dry-run. Use `ak symlink check` to detect drift without advertising a no-op dry run.',
        )
      }

      const repoRoot = findRepoRoot(process.cwd())

      if (action === 'sync') {
        const fixed = syncAll(repoRoot)
        // Exit 0 either way: `sync` is a repair action, not a check.
        return fixed > 0 ? 0 : 0
      }

      if (action === 'check') {
        const fixed = syncAll(repoRoot)
        if (fixed > 0) {
          console.error(
            `\n✗ Agent surface out of sync (${fixed} fixes applied during check). Commit the changes.`,
          )
          return 1
        }
        console.log('\n✓ Agent surface in sync.')
        return 0
      }

      throw commandError(`Unknown symlink action: ${action}. Use 'sync' or 'check'.`)
    })
}
