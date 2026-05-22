import { spawnSync } from 'node:child_process'

import type { MergeOptions } from '#cli/commands/init/merge'

export const OMC_MARKETPLACE = 'https://github.com/Yeachan-Heo/oh-my-claudecode'
export const OMC_PLUGIN_ID = 'oh-my-claudecode'
export const OMC_SETUP_COMMAND = '/oh-my-claudecode:omc-setup'

export type OmcSetupScope = 'user' | 'project'

export interface EnsureOmcInput {
  options: MergeOptions
  scope?: OmcSetupScope
  commandExists?: (command: string) => boolean
  runCommand?: (command: string, args: readonly string[]) => number
}

export type EnsureOmcResult =
  | { kind: 'omc-installed'; pluginId: string; scope: OmcSetupScope }
  | { kind: 'omc-skipped-dry-run'; scope: OmcSetupScope }
  | { kind: 'omc-skipped-opt-out'; scope: OmcSetupScope }
  | { kind: 'omc-skipped-no-cli'; scope: OmcSetupScope }
  | {
      kind: 'omc-failed'
      pluginId: string
      scope: OmcSetupScope
      step: 'marketplace-add' | 'plugin-install'
      exitCode: number
    }

function defaultCommandExists(command: string): boolean {
  const result = spawnSync('which', [command], { stdio: 'ignore' })
  return result.status === 0
}

function defaultRunCommand(command: string, args: readonly string[]): number {
  const result = spawnSync(command, [...args], {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) throw result.error
  return result.status ?? 1
}

/**
 * Install/refresh Oh My ClaudeCode through Claude Code's plugin system.
 *
 * Upstream OMC does not support direct npm/bun installation; the supported
 * path is Claude Code plugin marketplace add + plugin install, followed by the
 * OMC setup skill inside Claude Code when the operator wants to materialize
 * global/project CLAUDE.md defaults.
 */
export function ensureOmc(input: EnsureOmcInput): EnsureOmcResult {
  const scope = input.scope ?? 'user'
  if (input.options.dryRun) return { kind: 'omc-skipped-dry-run', scope }
  if (process.env.AK_SKIP_OMC === '1') return { kind: 'omc-skipped-opt-out', scope }

  const commandExists = input.commandExists ?? defaultCommandExists
  if (!commandExists('claude')) return { kind: 'omc-skipped-no-cli', scope }

  const runCommand = input.runCommand ?? defaultRunCommand
  const steps = [
    {
      step: 'marketplace-add' as const,
      args: ['plugin', 'marketplace', 'add', '--scope', scope, OMC_MARKETPLACE],
    },
    {
      step: 'plugin-install' as const,
      args: ['plugin', 'install', '--scope', scope, OMC_PLUGIN_ID],
    },
  ]

  for (const { step, args } of steps) {
    const exitCode = runCommand('claude', args)
    if (exitCode !== 0) {
      return { kind: 'omc-failed', pluginId: OMC_PLUGIN_ID, scope, step, exitCode }
    }
  }

  return { kind: 'omc-installed', pluginId: OMC_PLUGIN_ID, scope }
}
