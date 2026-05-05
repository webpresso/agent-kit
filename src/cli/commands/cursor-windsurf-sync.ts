/**
 * `ak cursor-windsurf-sync` — copy skills/*.md to .cursor/rules/ and .windsurf/skills/
 *
 * Fallback distribution path for Cursor and Windsurf when localskills.sh
 * registration format is unverified. Directly copies catalog skills from
 * the package's catalog directory into the IDE-native paths at the repo root.
 *
 * This is the primary-IDE distribution channel: run once after `ak setup`
 * to push all agent-kit skills into Cursor and Windsurf's native skill paths.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { CAC } from 'cac'

import { resolvePackageAsset } from '#utils/package-assets'
import { findRepoRoot } from '#utils/repo-root'

function resolveCatalogSkillsDir(): string {
  const dir = resolvePackageAsset('catalog/agent/skills')
  if (!existsSync(dir)) {
    throw new Error(
      `Could not locate catalog/agent/skills directory. ` +
        'Ensure @webpresso/agent-kit is installed correctly.',
    )
  }
  return dir
}

function copySkillsToIde(
  skillsDir: string,
  destDir: string,
  ideName: string,
): { copied: number; skipped: number } {
  mkdirSync(destDir, { recursive: true })

  let copied = 0
  let skipped = 0

  const entries = readdirSync(skillsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      skipped++
      continue
    }
    const src = join(skillsDir, entry.name)
    const dest = join(destDir, entry.name)
    copyFileSync(src, dest)
    console.log(`  Copied ${basename(entry.name)} → ${destDir}`)
    copied++
  }

  if (copied === 0 && skipped === 0) {
    console.log(`  No skill files found in ${skillsDir}`)
  }

  console.log(`  ${ideName}: ${copied} skills written`)
  return { copied, skipped }
}

export function registerCursorWindsurfSyncCommand(cli: CAC): void {
  cli
    .command(
      'cursor-windsurf-sync',
      'Copy agent-kit skills to .cursor/rules/ and .windsurf/skills/',
    )
    .action(async () => {
      const repoRoot = findRepoRoot(process.cwd())

      let skillsDir: string
      try {
        skillsDir = resolveCatalogSkillsDir()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error: ${msg}\nRun 'npm install @webpresso/agent-kit' to fix.\n`)
        process.exit(1)
      }

      console.log(`\nSyncing agent-kit skills to primary IDEs from ${skillsDir}\n`)

      const cursorDest = join(repoRoot, '.cursor', 'rules')
      const windsurfDest = join(repoRoot, '.windsurf', 'skills')

      const cursorResult = copySkillsToIde(skillsDir, cursorDest, 'Cursor')
      console.log()
      const windsurfResult = copySkillsToIde(skillsDir, windsurfDest, 'Windsurf')

      const total = cursorResult.copied + windsurfResult.copied
      console.log(`\nDone. ${total} skill files written across Cursor and Windsurf.`)
      return 0
    })
}
