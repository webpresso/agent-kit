/**
 * `ak symlink sync|check` — re-sync .claude/ .gemini/ .cursor/ .windsurf/
 * from the canonical .agent/ tree.
 *
 * Thin wrapper around `syncAll` from the symlinker module. `check` runs the
 * same logic as `sync` and exits non-zero if any drift was repaired —
 * suitable as a CI gate that reports "commit these changes".
 */

import type { CAC } from 'cac'

import { syncAll } from '#symlinker'
import { findRepoRoot } from '#utils/repo-root'

export function registerSymlinkCommand(cli: CAC): void {
  cli
    .command('symlink <action>', 'Sync agent-surface files across IDE consumers')
    .option('--dry-run', 'Report what would change without writing')
    .action(async (action: string, options: { dryRun?: boolean }) => {
      const repoRoot = findRepoRoot(process.cwd())

      if (action === 'sync') {
        if (options.dryRun) {
          // TODO(phase-2b): thread a checkOnly/dryRun mode through the
          //   symlinker so sync --dry-run can report drift without writing.
          //   For now, dry-run is a no-op that reminds the caller.
          console.log(
            'ak symlink sync --dry-run: the symlinker currently applies fixes unconditionally.\n' +
              'Use `ak symlink check` in CI to detect drift (non-zero exit when repairs are needed).',
          )
          process.exit(0)
        }
        const fixed = syncAll(repoRoot)
        // Exit 0 either way: `sync` is a repair action, not a check.
        process.exit(fixed > 0 ? 0 : 0)
      }

      if (action === 'check') {
        const fixed = syncAll(repoRoot)
        if (fixed > 0) {
          console.error(
            `\n✗ Agent surface out of sync (${fixed} fixes applied during check). Commit the changes.`,
          )
          process.exit(1)
        }
        console.log('\n✓ Agent surface in sync.')
        process.exit(0)
      }

      console.error(`Unknown symlink action: ${action}. Use 'sync' or 'check'.`)
      process.exit(1)
    })
}
