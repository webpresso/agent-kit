/**
 * Link agent-kit so every hook fires from live source.
 *
 * Default (no args):
 *   ~/.claude/plugins/cache/agent-kit/agent-kit/edge-local → this repo
 *
 * With --consumer <path> [--consumer <path> ...]:
 *   Also repoints <consumer>/node_modules/@webpresso/agent-kit → this repo,
 *   so project-level hook binaries (wp-pretool-guard, wp-sessionstart-routing,
 *   etc.) run from live source instead of the pnpm-store snapshot.
 *   Writes <consumer>/.webpresso/agent-kit-dev-link.json so the consumer's
 *   postinstall can auto-restore the symlink after `pnpm install`.
 *   Delete that state file to opt out of auto-restore.
 *
 * Usage:
 *   pnpm dev:link
 *   pnpm dev:link --consumer ~/repos/webpresso/monorepo
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STATE_FILE_RELATIVE_PATH } from '#dev/dev-link-state'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  name: string
  version: string
}

// ---------------------------------------------------------------------------
// Plugin-cache link (existing behaviour)
// ---------------------------------------------------------------------------
const cacheDir = join(homedir(), '.claude', 'plugins', 'cache', 'agent-kit', 'agent-kit')
const linkPath = join(cacheDir, 'edge-local')

mkdirSync(cacheDir, { recursive: true })
ensureSymlink(linkPath, repoRoot, 'plugin cache')

// ---------------------------------------------------------------------------
// Optional consumer-repo node_modules links
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const consumerPaths: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--consumer' && args[i + 1]) {
    consumerPaths.push(resolve(args[++i].replace(/^~/, homedir())))
  }
}

for (const consumerPath of consumerPaths) {
  const target = join(consumerPath, 'node_modules', '@webpresso', 'agent-kit')
  if (!existsSync(join(consumerPath, 'node_modules'))) {
    console.warn(`skip ${consumerPath} — node_modules not found (run pnpm install first)`)
    continue
  }
  mkdirSync(join(consumerPath, 'node_modules', '@webpresso'), { recursive: true })
  ensureSymlink(target, repoRoot, `consumer ${consumerPath}`)

  // Repoint nested @webpresso/agent-kit symlinks created by pnpm for sub-packages
  // (e.g. <consumer>/packages/foo/node_modules/@webpresso/agent-kit). Without this,
  // tests run from a sub-package resolve to the pnpm-store snapshot, not live source.
  repointNestedSymlinks(consumerPath, repoRoot)

  writeStateFile(consumerPath)
}

console.log('Restart Claude Code session to pick up the change.')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureSymlink(linkAt: string, target: string, label: string): void {
  if (existsSync(linkAt) || lstatExists(linkAt)) {
    const stat = lstatSync(linkAt)
    if (stat.isSymbolicLink()) {
      const current = readlinkSync(linkAt)
      if (current === target) {
        console.log(`${label}: already → ${target}`)
        return
      }
      unlinkSync(linkAt)
      console.log(`${label}: replaced stale symlink (was → ${current})`)
    } else {
      const backup = `${linkAt}.bak.${timestamp()}`
      renameSync(linkAt, backup)
      console.log(`${label}: backed up real dir → ${backup}`)
    }
  }
  symlinkSync(target, linkAt, 'dir')
  console.log(`${label}: linked ${linkAt} → ${target}`)
}

function lstatExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

function writeStateFile(consumerPath: string): void {
  const statePath = join(consumerPath, STATE_FILE_RELATIVE_PATH)
  mkdirSync(dirname(statePath), { recursive: true })
  const payload = {
    package: pkg.name,
    linkedFrom: repoRoot,
    linkedAt: new Date().toISOString(),
    agentKitVersion: pkg.version,
    note: 'Read by wp-restore-dev-links (consumer postinstall) to re-establish the symlink after pnpm install, and by wp-check-dev-link (SessionStart hook) to warn when the link is broken. Delete this file to disable the dev link.',
  }
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`consumer ${consumerPath}: wrote ${STATE_FILE_RELATIVE_PATH}`)
}

function repointNestedSymlinks(consumerRoot: string, target: string): void {
  const found: string[] = []
  walkForAgentKit(consumerRoot, found, 0)
  let repointed = 0
  for (const linkPath of found) {
    try {
      const current = readlinkSync(linkPath)
      if (!current.includes('node_modules/.pnpm/')) continue
      unlinkSync(linkPath)
      symlinkSync(target, linkPath, 'dir')
      repointed++
    } catch {
      // best-effort: skip entries we can't readlink (e.g. real dirs)
    }
  }
  if (repointed > 0) {
    console.log(`consumer ${consumerRoot}: repointed ${repointed} nested symlinks → ${target}`)
  }
}

function walkForAgentKit(dir: string, found: string[], depth: number): void {
  if (depth > 10) return
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    // Skip the consumer's pnpm store (its own @webpresso/agent-kit lives inside .pnpm/)
    if (e.name === '.pnpm') continue
    if (e.isSymbolicLink() && p.endsWith('/node_modules/@webpresso/agent-kit')) {
      found.push(p)
      continue
    }
    if (e.isDirectory()) walkForAgentKit(p, found, depth + 1)
  }
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
