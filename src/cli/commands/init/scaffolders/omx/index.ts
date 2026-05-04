/**
 * `omx` scaffolder preset.
 *
 * Ensures `omx` is installed, then chains `omx setup --yes` after the
 * agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process'

import type { MergeOptions } from '#cli/commands/init/merge'

export interface EnsureOmxInput {
  repoRoot: string
  options: MergeOptions
  /** Dependency-injection seam for tests; defaults to node's child_process.spawnSync. */
  spawn?: typeof spawnSync
}

export type EnsureOmxResult =
  | { kind: 'omx-ok'; installed: boolean }
  | { kind: 'omx-skipped-dry-run' }
  | { kind: 'omx-not-found'; hint: string }
  | { kind: 'omx-spawn-failed'; exitCode: number }

const NOT_FOUND_HINT =
  'omx (oh-my-codex) is not on PATH after `npm install -g oh-my-codex`. Install it manually and re-run.'

/**
 * Ensure `omx` is on PATH then run `omx setup --yes` in the consumer repo.
 * Idempotent: safe to run on every `ak setup`.
 */
export function ensureOmx(input: EnsureOmxInput): EnsureOmxResult {
  if (input.options.dryRun) return { kind: 'omx-skipped-dry-run' }

  const spawn = input.spawn ?? spawnSync

  let installed = false
  let probe = spawn('omx', ['--version'], { encoding: 'utf8' })
  if (probe.error || (probe.status !== null && probe.status !== 0)) {
    const install = spawn('npm', ['install', '-g', 'oh-my-codex'], { stdio: 'inherit' })
    if (install.status !== 0) {
      return { kind: 'omx-not-found', hint: NOT_FOUND_HINT }
    }

    installed = true
    probe = spawn('omx', ['--version'], { encoding: 'utf8' })
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
      return { kind: 'omx-not-found', hint: NOT_FOUND_HINT }
    }
  }

  const result = spawn('omx', ['setup', '--yes'], {
    cwd: input.repoRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 }
  }

  return { kind: 'omx-ok', installed }
}
