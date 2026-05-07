/**
 * Link the Claude Code plugin cache entry at
 * `~/.claude/plugins/cache/agent-kit/agent-kit/edge-local` to this repo so
 * every hook fires from live source via `bun ${CLAUDE_PLUGIN_ROOT}/src/...`.
 *
 * Idempotent. Backs up any pre-existing non-symlink directory before
 * replacing it. Run after a marketplace update to restore the dev link.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(homedir(), '.claude', 'plugins', 'cache', 'agent-kit', 'agent-kit')
const linkPath = join(cacheDir, 'edge-local')

mkdirSync(cacheDir, { recursive: true })

if (existsSync(linkPath) || lstatExists(linkPath)) {
  const stat = lstatSync(linkPath)
  if (stat.isSymbolicLink()) {
    const current = readlinkSync(linkPath)
    if (current === repoRoot) {
      console.log(`edge-local already → ${repoRoot}`)
      process.exit(0)
    }
    unlinkSync(linkPath)
    console.log(`replaced stale symlink (was → ${current})`)
  } else {
    const backup = `${linkPath}.bak.${timestamp()}`
    renameSync(linkPath, backup)
    console.log(`backed up real dir → ${backup}`)
  }
}

symlinkSync(repoRoot, linkPath, 'dir')
console.log(`linked ${linkPath} → ${repoRoot}`)
console.log('Restart Claude Code session to pick up the change.')

function lstatExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
