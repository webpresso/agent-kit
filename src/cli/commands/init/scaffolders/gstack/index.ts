/**
 * `gstack` scaffolder preset.
 *
 * gstack is a user-global skill registry installed at `~/.claude/skills/gstack/`.
 * It ships skills like `/qa`, `/ship`, `/review`, `/investigate`, `/browse`
 * that webpresso/ingest-lens both mark as required for AI-assisted work.
 *
 * Detection is path-based, NOT PATH-based: gstack is not a CLI binary on
 * $PATH — it's a directory of skills consumed by Claude Code via
 * `~/.claude/skills/gstack/`. Install is a clone + `./setup --team`.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import type { MergeOptions } from '../../merge.js'

export interface ScaffoldGstackInput {
  repoRoot: string
  options: MergeOptions
  /** Override gstack install root (defaults to ~/.claude/skills/gstack). Useful in tests. */
  installRoot?: string
  /** DI seam for child_process.spawnSync. */
  spawn?: typeof spawnSync
  /** DI seam for fs.existsSync. */
  exists?: typeof existsSync
}

export type ScaffoldGstackResult =
  | { kind: 'gstack-already-installed'; root: string }
  | { kind: 'gstack-installed'; root: string }
  | { kind: 'gstack-skipped-dry-run' }
  | { kind: 'gstack-clone-failed'; exitCode: number }
  | { kind: 'gstack-setup-failed'; exitCode: number }

const GSTACK_REPO = 'https://github.com/garrytan/gstack.git'

function defaultInstallRoot(): string {
  return path.join(homedir(), '.claude', 'skills', 'gstack')
}

/**
 * Ensure gstack is installed under the user's home dir. If it already is,
 * no-op. Otherwise clone the repo and run `./setup --team` once.
 */
export function scaffoldGstack(input: ScaffoldGstackInput): ScaffoldGstackResult {
  if (input.options.dryRun) {
    return { kind: 'gstack-skipped-dry-run' }
  }

  const spawn = input.spawn ?? spawnSync
  const exists = input.exists ?? existsSync
  const root = input.installRoot ?? defaultInstallRoot()

  if (exists(path.join(root, 'setup'))) {
    return { kind: 'gstack-already-installed', root }
  }

  const clone = spawn('git', ['clone', '--depth', '1', GSTACK_REPO, root], {
    stdio: 'inherit',
  })
  if (clone.status !== 0) {
    return { kind: 'gstack-clone-failed', exitCode: clone.status ?? -1 }
  }

  const setup = spawn('./setup', ['--team'], { cwd: root, stdio: 'inherit' })
  if (setup.status !== 0) {
    return { kind: 'gstack-setup-failed', exitCode: setup.status ?? -1 }
  }

  return { kind: 'gstack-installed', root }
}
