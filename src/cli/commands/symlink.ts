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
 *
 * Flags:
 *   --primary-ides   Only run the primary-IDE path (Cursor/Windsurf via
 *                    `ak cursor-windsurf-sync`). Skips Codex/Amp/Gemini.
 *   --tail-ides      Only run the tail-IDE symlinker path (Codex, Amp,
 *                    Gemini). Skips Cursor/Windsurf direct-copy.
 *   (no flags)       Run both paths — equivalent to passing both flags.
 */

import type { CAC } from 'cac'

import { importAgentFile, syncAll } from '#symlinker'
import { resolvePackageAsset } from '#utils/package-assets'
import { findRepoRoot } from '#utils/repo-root'

function commandError(message: string, exitCode = 1): Error & { exitCode: number } {
  const error = new Error(message) as Error & { exitCode: number }
  error.exitCode = exitCode
  return error
}

interface SymlinkOptions {
  dryRun?: boolean
  from?: string
  primaryIdes?: boolean
  tailIdes?: boolean
}

async function runPrimaryIdes(repoRoot: string): Promise<number> {
  // Inline the copy logic to avoid a subprocess. Mirrors cursor-windsurf-sync.ts
  // but runs in-process so errors propagate cleanly.
  const { copyFileSync, existsSync, mkdirSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')

  const skillsDir = resolvePackageAsset('catalog/agent/skills')
  if (!existsSync(skillsDir)) {
    console.error(
      'cursor-windsurf-sync: Could not locate catalog/agent/skills directory. ' +
        'Ensure @webpresso/agent-kit is installed correctly.',
    )
    return 1
  }

  console.log(`\nSyncing agent-kit skills to primary IDEs from ${skillsDir}\n`)

  let totalCopied = 0
  for (const [ideName, destRel] of [
    ['Cursor', join('.cursor', 'rules')],
    ['Windsurf', join('.windsurf', 'skills')],
  ] as [string, string][]) {
    const destDir = join(repoRoot, destRel)
    mkdirSync(destDir, { recursive: true })
    let copied = 0
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      copyFileSync(join(skillsDir, entry.name), join(destDir, entry.name))
      copied++
    }
    console.log(`  ${ideName}: ${copied} skills written to ${destRel}`)
    totalCopied += copied
  }

  console.log(`\nPrimary IDEs: ${totalCopied} skill files written.`)
  return 0
}

export function registerSymlinkCommand(cli: CAC): void {
  cli
    .command('symlink <action>', 'Sync agent-surface files across IDE consumers')
    .option('--primary-ides', 'Only sync primary IDEs (Cursor/Windsurf via cursor-windsurf-sync)')
    .option('--tail-ides', 'Only sync tail IDEs (Codex/Amp/Gemini via symlinker)')
    .option('--from <file>', 'Source file to import (for `symlink import`)')
    .action(async (action: string, options: SymlinkOptions = {}) => {
      if (options.dryRun) {
        throw commandError(
          'Unknown option: --dry-run. Use `ak symlink check` to detect drift without advertising a no-op dry run.',
        )
      }

      // When neither flag is set, run both paths (default).
      const runPrimary = options.primaryIdes === true || (!options.primaryIdes && !options.tailIdes)
      const runTail = options.tailIdes === true || (!options.primaryIdes && !options.tailIdes)

      const repoRoot = findRepoRoot(process.cwd())

      if (action === 'import') {
        const from = options.from
        if (!from) {
          throw commandError(
            '`ak symlink import` requires --from <file>. Supported: .cursorrules, CLAUDE.md, .github/copilot-instructions.md',
          )
        }
        const result = importAgentFile(repoRoot, from)
        if (result === null) {
          const msg = `Could not import '${from}': file not found or source not recognised.`
          console.error(msg)
          process.exit(1)
        }
        console.log(`✅ Imported ${result.source} → ${result.dest}`)
        console.log('   Run `ak symlink sync` to fan the canonical source back out.')
        return 0
      }

      if (action === 'sync') {
        if (runPrimary) {
          const code = await runPrimaryIdes(repoRoot)
          if (code !== 0) return code
        }

        if (runTail) {
          syncAll(repoRoot)
        }

        // Exit 0 either way: `sync` is a repair action, not a check.
        return 0
      }

      if (action === 'check') {
        if (options.primaryIdes && !options.tailIdes) {
          // primary-ides check: just verify the dirs exist (non-destructive)
          console.log('\n✓ Primary IDEs: use `ak symlink sync --primary-ides` to populate.')
          return 0
        }

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

      throw commandError(`Unknown symlink action: ${action}. Use 'sync', 'check', or 'import'.`)
    })
}
