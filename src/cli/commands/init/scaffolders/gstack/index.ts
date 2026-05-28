/**
 * `gstack` scaffolder preset.
 *
 * gstack uses a canonical checkout installed at `~/.claude/skills/gstack/`.
 * Agent-kit owns that checkout bootstrap, then lets gstack's own host-aware
 * setup command materialize additional surfaces such as Codex from the same
 * checkout.
 *
 * Detection for the canonical checkout is path-based, NOT PATH-based: gstack
 * itself is not a CLI binary on $PATH. Checkout bootstrap is a clone +
 * `./setup --team`. When Codex is detected, webpresso runs gstack's explicit
 * `./setup --host codex --team` flow from that same checkout so Codex is
 * materialized without accidentally fanning out to every host binary on PATH.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import { makeNoopSpinnerFactory, type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner'

export interface EnsureGstackInput {
  repoRoot: string
  options: MergeOptions
  /** Override gstack install root (defaults to ~/.claude/skills/gstack). Useful in tests. */
  installRoot?: string
  /** Override Codex config path (defaults to ~/.codex/config.toml). Useful in tests. */
  codexConfigPath?: string
  /** Override Codex skills root (defaults to ~/.codex/skills). Useful in tests. */
  codexSkillsRoot?: string
  /** DI seam for child_process.spawnSync. */
  spawn?: typeof spawnSync
  /** DI seam for fs.existsSync. */
  exists?: typeof existsSync
  /** DI seam for Codex detection in tests. */
  detectCodex?: (input: {
    spawn: typeof spawnSync
    exists: typeof existsSync
    codexConfigPath: string
  }) => boolean
  /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY, ora otherwise. */
  spinnerFactory?: SpinnerFactory
  /** DI seam for environment-backed host/output policy. */
  env?: NodeJS.ProcessEnv
  /** DI seam for user-visible progress lines. */
  log?: (message: string) => void
  /** DI seam for timing. */
  now?: () => number
}

export type GstackCodexResult =
  | { kind: 'gstack-codex-installed'; skillsRoot: string }
  | { kind: 'gstack-codex-updated'; skillsRoot: string }
  | { kind: 'gstack-codex-skipped'; reason: 'not-detected' | 'not-requested'; skillsRoot: string }

export type EnsureGstackResult =
  | { kind: 'gstack-installed'; root: string; codex: GstackCodexResult }
  | { kind: 'gstack-updated'; root: string; codex: GstackCodexResult }
  | { kind: 'gstack-skipped-dry-run' }
  | { kind: 'gstack-clone-failed'; exitCode: number }
  | { kind: 'gstack-pull-failed'; exitCode: number }
  | { kind: 'gstack-setup-failed'; exitCode: number; command: GstackSetupCommand }

const GSTACK_REPO = 'https://github.com/garrytan/gstack.git'

function defaultInstallRoot(): string {
  return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack')
}

function defaultCodexConfigPath(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'config.toml')
}

function defaultCodexSkillsRoot(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'skills')
}

type GstackSetupHost = 'auto' | 'codex'
type GstackSetupArgs = ['--team'] | ['--host', GstackSetupHost, '--team']
type GstackSetupCommand = '--team' | `--host ${GstackSetupHost} --team`
type GstackSetupStep = { args: GstackSetupArgs; command: GstackSetupCommand; label: string }

function formatDurationMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function isVerboseGstack(env: NodeJS.ProcessEnv): boolean {
  return env.WP_VERBOSE_GSTACK === '1'
}

function parseHostList(value: string): Array<'claude' | 'codex' | 'auto'> | null {
  const hosts = value
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  if (hosts.length === 0) return null
  if (hosts.includes('auto')) return ['auto']
  if (hosts.some((host) => host !== 'claude' && host !== 'codex')) return null
  return [...new Set(hosts)] as Array<'claude' | 'codex'>
}

function resolveSetupSteps(input: {
  codexDetected: boolean
  env: NodeJS.ProcessEnv
  log: (message: string) => void
}): GstackSetupStep[] {
  const explicitHosts = input.env.WP_GSTACK_HOSTS?.trim()
  if (explicitHosts) {
    const parsed = parseHostList(explicitHosts)
    if (!parsed) {
      input.log(
        `  gstack: ignoring invalid WP_GSTACK_HOSTS=${JSON.stringify(explicitHosts)}; falling back to default fast mode`,
      )
    } else {
      return parsed.map((host) =>
        host === 'claude'
          ? {
              args: ['--team'],
              command: '--team',
              label: 'refreshing Claude/team integration',
            }
          : host === 'codex'
            ? {
                args: ['--host', 'codex', '--team'],
                command: '--host codex --team',
                label: 'refreshing Codex integration',
              }
            : {
                args: ['--host', 'auto', '--team'],
                command: '--host auto --team',
                label: 'refreshing all detected gstack hosts',
              },
      )
    }
  }

  if (input.env.WP_GSTACK_MODE === 'full') {
    return [
      {
        args: ['--host', 'auto', '--team'],
        command: '--host auto --team',
        label: 'refreshing all detected gstack hosts',
      },
    ]
  }

  const steps: GstackSetupStep[] = [
    {
      args: ['--team'],
      command: '--team',
      label: 'refreshing Claude/team integration',
    },
  ]
  if (input.codexDetected) {
    steps.push({
      args: ['--host', 'codex', '--team'],
      command: '--host codex --team',
      label: 'refreshing Codex integration',
    })
  }
  return steps
}

function runSetup(
  root: string,
  spawn: typeof spawnSync,
  step: GstackSetupStep,
  env: NodeJS.ProcessEnv,
  log: (message: string) => void,
  now: () => number,
): { ok: boolean; exitCode: number; command: GstackSetupCommand } {
  const startedAt = now()
  const verbose = isVerboseGstack(env)
  const args = verbose ? step.args : [...step.args, '--quiet']
  log(`  gstack: ${step.label}...`)
  const result = spawn('./setup', args, { cwd: root, stdio: 'inherit' })
  if (result.status === 0) {
    log(`  gstack: ${step.label} done (${formatDurationMs(now() - startedAt)})`)
  }
  return {
    ok: result.status === 0,
    exitCode: result.status ?? -1,
    command: step.command,
  }
}

function defaultDetectCodex(input: {
  spawn: typeof spawnSync
  exists: typeof existsSync
  codexConfigPath: string
}): boolean {
  if (input.exists(input.codexConfigPath)) return true
  const probe = input.spawn('codex', ['--version'], { stdio: 'ignore' })
  return probe.status === 0
}

/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 * - If Codex is detected: materialize Codex skills from the canonical checkout.
 */
export function ensureGstack(input: EnsureGstackInput): EnsureGstackResult {
  if (input.options.dryRun) return { kind: 'gstack-skipped-dry-run' }

  const spawn = input.spawn ?? spawnSync
  const exists = input.exists ?? existsSync
  const detectCodex = input.detectCodex ?? defaultDetectCodex
  const env = input.env ?? process.env
  const log = input.log ?? console.log
  const now = input.now ?? Date.now
  const root = input.installRoot ?? defaultInstallRoot()
  const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath()
  const codexSkillsRoot = input.codexSkillsRoot ?? defaultCodexSkillsRoot()
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('gstack')
  const hasSetup = exists(path.join(root, 'setup'))
  const hasGitDir = exists(path.join(root, '.git'))
  const codexDetected = detectCodex({
    spawn,
    exists,
    codexConfigPath,
  })
  const hadCodexSkills = exists(path.join(codexSkillsRoot, 'gstack'))
  const steps = resolveSetupSteps({ codexDetected, env, log })
  const requestsCodex = steps.some((step) => step.command === '--host codex --team')
  const usesAutoHosts = steps.some((step) => step.command === '--host auto --team')

  const finalizeCodexResult = (): GstackCodexResult => {
    if (requestsCodex) {
      return hadCodexSkills
        ? { kind: 'gstack-codex-updated', skillsRoot: codexSkillsRoot }
        : { kind: 'gstack-codex-installed', skillsRoot: codexSkillsRoot }
    }
    if (usesAutoHosts) {
      if (!codexDetected) {
        return {
          kind: 'gstack-codex-skipped',
          reason: 'not-detected',
          skillsRoot: codexSkillsRoot,
        }
      }
      return hadCodexSkills
        ? { kind: 'gstack-codex-updated', skillsRoot: codexSkillsRoot }
        : { kind: 'gstack-codex-installed', skillsRoot: codexSkillsRoot }
    }
    if (!codexDetected) {
      return {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: codexSkillsRoot,
      }
    }
    return {
      kind: 'gstack-codex-skipped',
      reason: 'not-requested',
      skillsRoot: codexSkillsRoot,
    }
  }

  if (hasSetup) {
    if (hasGitDir) {
      spinner.start()
      const pull = spawn('git', ['pull', '--ff-only', 'origin', 'main'], {
        cwd: root,
        stdio: 'inherit',
      })
      if (pull.status !== 0) {
        spinner.fail('gstack pull failed')
        return { kind: 'gstack-pull-failed', exitCode: pull.status ?? -1 }
      }
    }

    for (const step of steps) {
      const setup = runSetup(root, spawn, step, env, log, now)
      if (!setup.ok) {
        spinner.fail(
          step.command === '--team' ? 'gstack setup failed' : 'gstack codex setup failed',
        )
        return { kind: 'gstack-setup-failed', exitCode: setup.exitCode, command: setup.command }
      }
    }

    const codex = finalizeCodexResult()
    spinner.succeed('gstack updated')
    return { kind: 'gstack-updated', root, codex }
  }

  spinner.start()
  const clone = spawn('git', ['clone', '--depth', '1', GSTACK_REPO, root], {
    stdio: 'inherit',
  })
  if (clone.status !== 0) {
    spinner.fail('gstack clone failed')
    return { kind: 'gstack-clone-failed', exitCode: clone.status ?? -1 }
  }

  for (const step of steps) {
    const setup = runSetup(root, spawn, step, env, log, now)
    if (!setup.ok) {
      spinner.fail(step.command === '--team' ? 'gstack setup failed' : 'gstack codex setup failed')
      return { kind: 'gstack-setup-failed', exitCode: setup.exitCode, command: setup.command }
    }
  }

  const codex = finalizeCodexResult()
  spinner.succeed('gstack installed')
  return { kind: 'gstack-installed', root, codex }
}
