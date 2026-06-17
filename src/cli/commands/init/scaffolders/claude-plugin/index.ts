import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import { commandExists as defaultCommandExists } from '#runtime/command-exists.js'

export const CLAUDE_PLUGIN_ID = 'agent-kit@webpresso'

export interface EnsureClaudePluginInput {
  options: MergeOptions
  packageRoot: string
  commandExists?: (command: string) => boolean
  runCommand?: (command: string, args: readonly string[]) => number
}

export type EnsureClaudePluginResult =
  | { kind: 'claude-plugin-installed'; packageRoot: string; pluginId: string }
  | { kind: 'claude-plugin-skipped-dry-run'; packageRoot: string }
  | { kind: 'claude-plugin-skipped-opt-out'; packageRoot: string }
  | { kind: 'claude-plugin-skipped-no-cli'; packageRoot: string }
  | { kind: 'claude-plugin-unavailable'; packageRoot: string }
  | {
      kind: 'claude-plugin-failed'
      packageRoot: string
      pluginId: string
      step: 'marketplace-add' | 'plugin-install'
      exitCode: number
    }

function defaultRunCommand(command: string, args: readonly string[]): number {
  const result = spawnSync(command, [...args], {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) throw result.error
  return result.status ?? 1
}

export function ensureClaudeCodeUserPlugin(
  input: EnsureClaudePluginInput,
): EnsureClaudePluginResult {
  const packageRoot = input.packageRoot
  const pluginManifestPath = join(packageRoot, '.claude-plugin', 'plugin.json')
  if (!existsSync(pluginManifestPath)) {
    return { kind: 'claude-plugin-unavailable', packageRoot }
  }

  if (input.options.dryRun) {
    return { kind: 'claude-plugin-skipped-dry-run', packageRoot }
  }

  if (process.env.WP_SKIP_CLAUDE_PLUGIN === '1') {
    return { kind: 'claude-plugin-skipped-opt-out', packageRoot }
  }

  const commandExists = input.commandExists ?? defaultCommandExists
  if (!commandExists('claude')) {
    return { kind: 'claude-plugin-skipped-no-cli', packageRoot }
  }

  const runCommand = input.runCommand ?? defaultRunCommand
  const steps = [
    {
      step: 'marketplace-add' as const,
      args: ['plugin', 'marketplace', 'add', '--scope', 'user', packageRoot],
    },
    {
      step: 'plugin-install' as const,
      args: ['plugin', 'install', '--scope', 'user', CLAUDE_PLUGIN_ID],
    },
  ]

  for (const { step, args } of steps) {
    const exitCode = runCommand('claude', args)
    if (exitCode !== 0) {
      return {
        kind: 'claude-plugin-failed',
        packageRoot,
        pluginId: CLAUDE_PLUGIN_ID,
        step,
        exitCode,
      }
    }
  }

  return {
    kind: 'claude-plugin-installed',
    packageRoot,
    pluginId: CLAUDE_PLUGIN_ID,
  }
}
